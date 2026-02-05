import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  assertPermission,
  canAccessBook,
  canEditChapter,
  canViewChapter,
  getEffectivePermissions,
} from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";

interface ChapterDetailPageProps {
  params: { id: string };
}

export default async function ChapterDetailPage({ params }: ChapterDetailPageProps) {
  const user = await getSessionUser();
  if (!user) return null;

  const chapter = await prisma.chapter.findUnique({
    where: { id: params.id },
    include: { book: true, assignedToUser: true },
  });

  if (!chapter) {
    redirect("/books");
  }

  const canAccess = await canAccessBook(user, chapter.bookId);
  if (!canAccess) {
    redirect("/books");
  }

  const canView = await canViewChapter(user, chapter);
  if (!canView) {
    redirect("/books");
  }

  const permissions = await getEffectivePermissions(user.id);
  const canClaim = permissions.has(PERMISSIONS.CHAPTER_CLAIM);
  const canAssign = permissions.has(PERMISSIONS.CHAPTER_ASSIGN);
  const canChangeStatus = permissions.has(PERMISSIONS.CHAPTER_CHANGE_STATUS);
  const canEdit = await canEditChapter(user, chapter);

  const users = canAssign
    ? await prisma.user.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      })
    : [];

  async function claimChapter() {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.CHAPTER_CLAIM);

    const freshChapter = await prisma.chapter.findUnique({
      where: { id: params.id },
    });
    if (!freshChapter || freshChapter.status !== "AVAILABLE") return;
    const allowed = await canAccessBook(sessionUser, freshChapter.bookId);
    if (!allowed) return;

    await prisma.chapter.update({
      where: { id: params.id },
      data: {
        status: "CLAIMED",
        assignedToUserId: sessionUser.id,
        claimedAt: new Date(),
      },
    });
  }

  async function unclaimChapter() {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.CHAPTER_UNCLAIM);

    const freshChapter = await prisma.chapter.findUnique({
      where: { id: params.id },
    });
    if (!freshChapter || freshChapter.assignedToUserId !== sessionUser.id) return;

    await prisma.chapter.update({
      where: { id: params.id },
      data: {
        status: "AVAILABLE",
        assignedToUserId: null,
        claimedAt: null,
      },
    });
  }

  async function updateStatus(formData: FormData) {
    "use server";
    const status = String(formData.get("status") || "AVAILABLE") as
      | "AVAILABLE"
      | "CLAIMED"
      | "IN_PROGRESS"
      | "DONE";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.CHAPTER_CHANGE_STATUS);

    const freshChapter = await prisma.chapter.findUnique({
      where: { id: params.id },
    });
    if (!freshChapter) return;
    const canEditNow = await canEditChapter(sessionUser, freshChapter);
    if (!canEditNow) return;

    await prisma.chapter.update({
      where: { id: params.id },
      data: { status },
    });
  }

  async function updateMetadata(formData: FormData) {
    "use server";
    const number = String(formData.get("number") || "");
    const title = String(formData.get("title") || "");
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.CHAPTER_UPDATE);

    const freshChapter = await prisma.chapter.findUnique({
      where: { id: params.id },
    });
    if (!freshChapter) return;
    const canEditNow = await canEditChapter(sessionUser, freshChapter);
    if (!canEditNow) return;

    await prisma.chapter.update({
      where: { id: params.id },
      data: { number, title: title || null },
    });
  }

  async function assignChapter(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.CHAPTER_ASSIGN);

    const assignedToUserId = String(formData.get("assignedToUserId") || "");
    await prisma.chapter.update({
      where: { id: params.id },
      data: {
        assignedToUserId: assignedToUserId || null,
        status: assignedToUserId ? "CLAIMED" : "AVAILABLE",
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">
          {chapter.book.titleFa} · چپتر {chapter.number}
        </h2>
        <p className="text-sm text-gray-500">صفحه ترجمه (نسخه MVP)</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2">
          <p className="text-sm">وضعیت فعلی: {chapter.status}</p>
          <p className="text-sm">مترجم: {chapter.assignedToUser?.name ?? "-"}</p>
          <div className="flex flex-wrap gap-2">
            {canClaim && chapter.status === "AVAILABLE" && (
              <form action={claimChapter}>
                <button className="rounded-md bg-gray-900 px-3 py-2 text-xs text-white">
                  برداشتن چپتر
                </button>
              </form>
            )}
            {permissions.has(PERMISSIONS.CHAPTER_UNCLAIM) &&
              chapter.assignedToUserId === user.id && (
                <form action={unclaimChapter}>
                  <button className="rounded-md border border-gray-300 px-3 py-2 text-xs">
                    رها کردن
                  </button>
                </form>
              )}
          </div>
        </div>

        {canAssign && (
          <div className="card">
            <p className="text-sm font-semibold">تخصیص چپتر</p>
            <form action={assignChapter} className="mt-3 space-y-2">
              <select name="assignedToUserId" defaultValue={chapter.assignedToUserId ?? ""}>
                <option value="">بدون تخصیص</option>
                {users.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.email}
                  </option>
                ))}
              </select>
              <button className="rounded-md bg-gray-900 px-3 py-2 text-xs text-white">
                ذخیره تخصیص
              </button>
            </form>
          </div>
        )}
      </div>

      {canChangeStatus && (
        <div className="card">
          <p className="text-sm font-semibold">تغییر وضعیت</p>
          <form action={updateStatus} className="mt-3 flex flex-wrap gap-2">
            <select name="status" defaultValue={chapter.status}>
              <option value="AVAILABLE">آزاد</option>
              <option value="CLAIMED">برداشته شده</option>
              <option value="IN_PROGRESS">در حال انجام</option>
              <option value="DONE">انجام شده</option>
            </select>
            <button className="rounded-md bg-gray-900 px-3 py-2 text-xs text-white">
              ثبت وضعیت
            </button>
          </form>
        </div>
      )}

      {canEdit && (
        <div className="card">
          <p className="text-sm font-semibold">ویرایش متادیتا</p>
          <form action={updateMetadata} className="mt-3 space-y-2">
            <input name="number" defaultValue={chapter.number} />
            <input name="title" defaultValue={chapter.title ?? ""} />
            <button className="rounded-md bg-gray-900 px-3 py-2 text-xs text-white">
              ذخیره متادیتا
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <p className="text-sm font-semibold">ویرایشگر ترجمه</p>
        <p className="mt-2 text-sm text-gray-500">
          نسخه MVP: ویرایشگر ترجمه در مرحله بعدی اضافه می‌شود.
        </p>
      </div>
    </div>
  );
}
