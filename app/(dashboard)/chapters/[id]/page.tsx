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
import ChapterActionButton from "@/components/ChapterActionButton";
import { revalidatePath } from "next/cache";

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
    redirect(
      `/books/${chapter.bookId}?notice=${encodeURIComponent("این چپتر برای شما نیست.")}`,
    );
  }

  const permissions = await getEffectivePermissions(user.id);
  const canClaim = permissions.has(PERMISSIONS.CHAPTER_CLAIM);
  const canAssign = permissions.has(PERMISSIONS.CHAPTER_ASSIGN);
  const canChangeStatus = permissions.has(PERMISSIONS.CHAPTER_CHANGE_STATUS);
  const canEdit = await canEditChapter(user, chapter);
  const canEditMetadata = canEdit && permissions.has(PERMISSIONS.CHAPTER_UPDATE);
  const canViewAssets = permissions.has(PERMISSIONS.CHAPTER_ASSETS_VIEW);
  const canViewAssetsPage = permissions.has(PERMISSIONS.CHAPTER_ASSETS_PAGE_VIEW);
  const canManageAssets =
    canEdit &&
    (permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPLOAD) ||
      permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPDATE) ||
      permissions.has(PERMISSIONS.CHAPTER_ASSETS_DELETE));

  const [totalPages, translatedPages, historyEntries] = canViewAssets
    ? await Promise.all([
        prisma.chapterAsset.count({ where: { chapterId: chapter.id } }),
        prisma.chapterAsset.count({
          where: { chapterId: chapter.id, isTranslated: true },
        }),
        prisma.chapterPageHistory.findMany({
          where: { chapterId: chapter.id },
          select: { metadata: true },
        }),
      ])
    : [0, 0, []];

  const editorsMap = new Map<
    string,
    { id?: string; name?: string | null; email?: string | null }
  >();
  historyEntries.forEach((entry) => {
    const metadata = entry.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return;
    const editor = (metadata as { editor?: { id?: string; name?: string; email?: string } })
      .editor;
    if (!editor) return;
    const key = editor.id ?? editor.email ?? editor.name ?? "unknown";
    if (!editorsMap.has(key)) {
      editorsMap.set(key, editor);
    }
  });
  const editors = Array.from(editorsMap.values());

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
    revalidatePath(`/chapters/${params.id}`);
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
    const allowed = await canAccessBook(sessionUser, freshChapter.bookId);
    if (!allowed) {
      redirect(
        `/books/${freshChapter.bookId}?notice=${encodeURIComponent(
          "دسترسی شما به این چپتر برداشته شده است.",
        )}`,
      );
    }

    await prisma.chapter.update({
      where: { id: params.id },
      data: {
        status: "AVAILABLE",
        assignedToUserId: null,
        claimedAt: null,
      },
    });
    revalidatePath(`/chapters/${params.id}`);
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
      data:
        status === "AVAILABLE"
          ? { status, assignedToUserId: null, claimedAt: null }
          : { status },
    });
    revalidatePath(`/chapters/${params.id}`);
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
    revalidatePath(`/chapters/${params.id}`);
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
    revalidatePath(`/chapters/${params.id}`);
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
                <ChapterActionButton
                  label="برداشتن چپتر"
                  pendingLabel="در حال برداشتن..."
                  className="rounded-md bg-gray-900 px-3 py-2 text-xs text-white"
                />
              </form>
            )}
            {permissions.has(PERMISSIONS.CHAPTER_UNCLAIM) &&
              chapter.assignedToUserId === user.id && (
                <form action={unclaimChapter}>
                  <ChapterActionButton
                    label="رها کردن"
                    pendingLabel="در حال رها کردن..."
                    className="rounded-md border border-gray-300 px-3 py-2 text-xs"
                  />
                </form>
              )}
          </div>
        </div>

        {canViewAssets && (
          <div className="card space-y-2">
            <p className="text-sm font-semibold">پیشرفت ترجمه</p>
            <p className="text-sm">
              {translatedPages} از {totalPages} صفحه ترجمه شده است.
            </p>
            <p className="text-xs text-gray-500">
              {totalPages === 0
                ? "هنوز صفحه‌ای بارگذاری نشده است."
                : `${Math.round((translatedPages / totalPages) * 100)}٪ تکمیل`}
            </p>
          </div>
        )}

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
              <ChapterActionButton
                label="ذخیره تخصیص"
                pendingLabel="در حال ذخیره..."
                className="rounded-md bg-gray-900 px-3 py-2 text-xs text-white"
              />
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
            <ChapterActionButton
              label="ثبت وضعیت"
              pendingLabel="در حال ثبت..."
              className="rounded-md bg-gray-900 px-3 py-2 text-xs text-white"
            />
          </form>
        </div>
      )}

      {canEditMetadata && (
        <div className="card">
          <p className="text-sm font-semibold">ویرایش متادیتا</p>
          <form action={updateMetadata} className="mt-3 space-y-2">
            <input name="number" defaultValue={chapter.number} />
            <input name="title" defaultValue={chapter.title ?? ""} />
            <ChapterActionButton
              label="ذخیره متادیتا"
              pendingLabel="در حال ذخیره..."
              className="rounded-md bg-gray-900 px-3 py-2 text-xs text-white"
            />
          </form>
        </div>
      )}

      <div className="card">
        <p className="text-sm font-semibold">ویرایشگر ترجمه</p>
        <p className="mt-2 text-sm text-gray-500">
          نسخه MVP: ویرایشگر ترجمه در مرحله بعدی اضافه می‌شود.
        </p>
        {canViewAssets && (
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <a href={`/chapters/${params.id}/translate`} className="text-blue-600">
              ورود به ویرایشگر ترجمه
            </a>
            {canViewAssetsPage && canManageAssets && (
              <a href={`/chapters/${params.id}/assets`} className="text-blue-600">
                مدیریت دارایی‌های چپتر
              </a>
            )}
          </div>
        )}
      </div>

      {canViewAssets && (
        <div className="card space-y-3">
          <div>
            <p className="text-sm font-semibold">ویرایشگران چپتر</p>
            <p className="text-xs text-gray-500">کاربرانی که روی صفحات این چپتر کار کرده‌اند.</p>
          </div>
          {editors.length === 0 ? (
            <p className="text-sm text-gray-500">ویرایشگری ثبت نشده است.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {editors.map((editor) => (
                <li key={editor.id ?? editor.email ?? editor.name ?? "unknown"}>
                  {editor.name ?? editor.email ?? "کاربر ناشناس"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
