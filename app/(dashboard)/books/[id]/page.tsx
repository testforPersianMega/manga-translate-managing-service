import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  assertPermission,
  canAccessBook,
  getEffectivePermissions,
  redirectIfNoPermission,
} from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { deleteChapterAssets } from "@/lib/chapter-assets";
import BookChaptersTable from "@/components/books/BookChaptersTable";
import Link from "next/link";

interface BookDetailPageProps {
  params: { id: string };
  searchParams?: { notice?: string };
}

export default async function BookDetailPage({
  params,
  searchParams,
}: BookDetailPageProps) {
  const user = await getSessionUser();
  if (!user) return null;
  await redirectIfNoPermission(user.id, PERMISSIONS.BOOK_VIEW, "/books");

  const book = await prisma.book.findUnique({
    where: { id: params.id },
    include: {
      chapters: { orderBy: { createdAt: "desc" }, include: { assignedToUser: true } },
    },
  });

  if (!book) {
    redirect("/books");
  }

  const canAccess = await canAccessBook(user, book.id);
  if (!canAccess) {
    redirect("/books");
  }

  const permissions = await getEffectivePermissions(user.id);
  const canDeleteChapter = permissions.has(PERMISSIONS.CHAPTER_DELETE);
  const canCreateChapter = permissions.has(PERMISSIONS.CHAPTER_CREATE);
  const canUpdateBook = permissions.has(PERMISSIONS.BOOK_UPDATE);
  const canDeleteBook = permissions.has(PERMISSIONS.BOOK_DELETE);
  const canAssignChapter = permissions.has(PERMISSIONS.CHAPTER_ASSIGN);
  const canChangeStatus = permissions.has(PERMISSIONS.CHAPTER_CHANGE_STATUS);

  const chapterIds = book.chapters.map((chapter) => chapter.id);
  const [chapterTotals, chapterTranslated] = chapterIds.length
    ? await Promise.all([
        prisma.chapterAsset.groupBy({
          by: ["chapterId"],
          where: { chapterId: { in: chapterIds } },
          _count: { _all: true },
        }),
        prisma.chapterAsset.groupBy({
          by: ["chapterId"],
          where: { chapterId: { in: chapterIds }, isTranslated: true },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const totalsMap = new Map(
    chapterTotals.map((entry) => [entry.chapterId, entry._count._all]),
  );
  const translatedMap = new Map(
    chapterTranslated.map((entry) => [entry.chapterId, entry._count._all]),
  );
  const totalPages = chapterTotals.reduce((sum, entry) => sum + entry._count._all, 0);
  const translatedPages = chapterTranslated.reduce(
    (sum, entry) => sum + entry._count._all,
    0,
  );

  const accessUsers = await prisma.bookAccess.findMany({
    where: { bookId: book.id },
    include: { user: true },
    orderBy: { user: { email: "asc" } },
  });
  const assignableUsers = canAssignChapter
    ? await prisma.user.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      })
    : [];

  async function createChapter(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.CHAPTER_CREATE);

    const number = String(formData.get("number") || "");
    const title = String(formData.get("title") || "");

    const allowed = await canAccessBook(sessionUser, params.id);
    if (!allowed) {
      throw new Error("عدم دسترسی به کتاب");
    }

    await prisma.chapter.create({
      data: {
        bookId: params.id,
        number,
        title: title || null,
      },
    });
    redirect(`/books/${params.id}`);
  }

  async function removeChapter(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.CHAPTER_DELETE);

    const chapterId = String(formData.get("chapterId") || "");
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) return;

    const allowed = await canAccessBook(sessionUser, chapter.bookId);
    if (!allowed) {
      throw new Error("عدم دسترسی به کتاب");
    }

    await deleteChapterAssets(chapterId);
    await prisma.chapter.delete({ where: { id: chapterId } });
    redirect(`/books/${params.id}`);
  }

  async function bulkDeleteChapters(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.CHAPTER_DELETE);

    const allowed = await canAccessBook(sessionUser, params.id);
    if (!allowed) {
      throw new Error("عدم دسترسی به کتاب");
    }

    const chapterIds = formData.getAll("chapterIds").map(String);
    if (chapterIds.length === 0) {
      redirect(`/books/${params.id}`);
    }

    const chapters = await prisma.chapter.findMany({
      where: { id: { in: chapterIds }, bookId: params.id },
    });

    for (const chapter of chapters) {
      await deleteChapterAssets(chapter.id);
    }

    await prisma.chapter.deleteMany({
      where: { id: { in: chapters.map((chapter) => chapter.id) } },
    });

    redirect(`/books/${params.id}`);
  }

  async function bulkUpdateChapters(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    const statusInput = String(formData.get("status") || "keep");
    const assignmentInput = String(formData.get("assignedToUserId") || "keep");
    const shouldChangeStatus = statusInput !== "keep";
    const shouldAssign = assignmentInput !== "keep";

    if (!shouldChangeStatus && !shouldAssign) {
      redirect(`/books/${params.id}`);
    }

    if (shouldChangeStatus) {
      await assertPermission(sessionUser.id, PERMISSIONS.CHAPTER_CHANGE_STATUS);
    }
    if (shouldAssign) {
      await assertPermission(sessionUser.id, PERMISSIONS.CHAPTER_ASSIGN);
    }

    const allowed = await canAccessBook(sessionUser, params.id);
    if (!allowed) {
      throw new Error("عدم دسترسی به کتاب");
    }

    const chapterIds = formData.getAll("chapterIds").map(String);
    if (chapterIds.length === 0) {
      redirect(`/books/${params.id}`);
    }

    const chapters = await prisma.chapter.findMany({
      where: { id: { in: chapterIds }, bookId: params.id },
      select: { id: true },
    });

    if (chapters.length === 0) {
      redirect(`/books/${params.id}`);
    }

    const data: {
      status?: "AVAILABLE" | "CLAIMED" | "IN_PROGRESS" | "DONE";
      assignedToUserId?: string | null;
      claimedAt?: Date | null;
    } = {};

    if (shouldChangeStatus) {
      data.status = statusInput as "AVAILABLE" | "CLAIMED" | "IN_PROGRESS" | "DONE";
      if (statusInput === "AVAILABLE") {
        data.assignedToUserId = null;
        data.claimedAt = null;
      }
    }

    if (shouldAssign && statusInput !== "AVAILABLE") {
      if (assignmentInput === "none") {
        data.assignedToUserId = null;
        if (!shouldChangeStatus) {
          data.status = "AVAILABLE";
        }
        data.claimedAt = null;
      } else {
        data.assignedToUserId = assignmentInput;
        data.status = shouldChangeStatus
          ? data.status
          : ("CLAIMED" as "CLAIMED");
        data.claimedAt = new Date();
      }
    }

    await prisma.chapter.updateMany({
      where: { id: { in: chapters.map((chapter) => chapter.id) } },
      data,
    });

    redirect(`/books/${params.id}`);
  }

  async function updateBookTitle(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.BOOK_UPDATE);

    const allowed = await canAccessBook(sessionUser, params.id);
    if (!allowed) {
      throw new Error("عدم دسترسی به کتاب");
    }

    const titleFa = String(formData.get("titleFa") || "").trim();
    const titleEn = String(formData.get("titleEn") || "").trim();

    await prisma.book.update({
      where: { id: params.id },
      data: {
        titleFa,
        titleEn: titleEn || null,
      },
    });

    redirect(`/books/${params.id}`);
  }

  async function deleteBook() {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.BOOK_DELETE);

    const allowed = await canAccessBook(sessionUser, params.id);
    if (!allowed) {
      throw new Error("عدم دسترسی به کتاب");
    }

    const chapters = await prisma.chapter.findMany({
      where: { bookId: params.id },
      select: { id: true },
    });

    for (const chapter of chapters) {
      await deleteChapterAssets(chapter.id);
    }

    await prisma.$transaction([
      prisma.chapter.deleteMany({ where: { bookId: params.id } }),
      prisma.bookAccess.deleteMany({ where: { bookId: params.id } }),
      prisma.book.delete({ where: { id: params.id } }),
    ]);

    redirect("/books");
  }

  return (
    <div className="space-y-6">
      {searchParams?.notice && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {searchParams.notice}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{book.titleFa}</h2>
          <p className="text-sm text-gray-500">مدیریت چپترها</p>
        </div>
      </div>

      {canUpdateBook && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold">ویرایش عنوان کتاب</summary>
          <form action={updateBookTitle} className="mt-4 space-y-3">
            <input name="titleFa" defaultValue={book.titleFa} required />
            <input name="titleEn" defaultValue={book.titleEn ?? ""} placeholder="عنوان انگلیسی" />
            <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
              ذخیره تغییرات
            </button>
          </form>
        </details>
      )}

      {canDeleteBook && (
        <form action={deleteBook} className="card flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">حذف کتاب</p>
            <p className="text-xs text-gray-500">این عملیات غیرقابل بازگشت است.</p>
          </div>
          <button className="rounded-md bg-red-600 px-4 py-2 text-sm text-white">
            حذف کتاب
          </button>
        </form>
      )}

      {canCreateChapter && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold">ایجاد چپتر</summary>
          <form action={createChapter} className="mt-4 space-y-3">
            <input name="number" placeholder="شماره چپتر (مثلاً 12.5)" required />
            <input name="title" placeholder="عنوان" />
            <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
              ثبت چپتر
            </button>
          </form>
        </details>
      )}

      <div className="card">
        <h3 className="text-sm font-semibold">پیشرفت ترجمه کتاب</h3>
        <p className="mt-2 text-sm text-gray-600">
          {translatedPages} از {totalPages} صفحه ترجمه شده است.
        </p>
      </div>

      <div className="card">
        <BookChaptersTable
          chapters={book.chapters.map((chapter) => ({
            ...chapter,
            translatedPages: translatedMap.get(chapter.id) ?? 0,
            totalPages: totalsMap.get(chapter.id) ?? 0,
            assignedToUserId: chapter.assignedToUserId ?? null,
            assignedToUserName:
              chapter.assignedToUser?.name ?? chapter.assignedToUser?.email ?? null,
          }))}
          canDelete={canDeleteChapter}
          canAssign={canAssignChapter}
          canChangeStatus={canChangeStatus}
          assignableUsers={assignableUsers}
          currentUserId={user.id}
          onDeleteChapter={removeChapter}
          onBulkDelete={bulkDeleteChapters}
          onBulkUpdate={bulkUpdateChapters}
        />
      </div>

      <div className="card space-y-3">
        <div>
          <h3 className="text-sm font-semibold">کاربران دارای دسترسی</h3>
          <p className="text-xs text-gray-500">لیست کاربران مجاز به مشاهده این کتاب</p>
        </div>
        {accessUsers.length === 0 ? (
          <p className="text-sm text-gray-500">دسترسی خاصی ثبت نشده است.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {accessUsers.map((access) => (
              <li key={access.userId} className="flex items-center justify-between">
                <span>{access.user.name ?? access.user.email}</span>
                <Link href={`/users/${access.userId}`} className="text-xs text-blue-600">
                  مشاهده پروفایل
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
