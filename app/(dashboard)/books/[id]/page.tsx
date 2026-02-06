import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { assertPermission, canAccessBook, getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { deleteChapterAssets } from "@/lib/chapter-assets";

interface BookDetailPageProps {
  params: { id: string };
}

export default async function BookDetailPage({ params }: BookDetailPageProps) {
  const user = await getSessionUser();
  if (!user) return null;
  await assertPermission(user.id, PERMISSIONS.BOOK_VIEW);

  const book = await prisma.book.findUnique({
    where: { id: params.id },
    include: { chapters: true },
  });

  if (!book) {
    redirect("/books");
  }

  const canAccess = await canAccessBook(user, book.id);
  if (!canAccess) {
    redirect("/books");
  }

  const permissions = await getEffectivePermissions(user.id);
  const canDelete = permissions.has(PERMISSIONS.CHAPTER_DELETE);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{book.titleFa}</h2>
          <p className="text-sm text-gray-500">مدیریت چپترها</p>
        </div>
      </div>

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

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>شماره</th>
              <th>عنوان</th>
              <th>وضعیت</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {book.chapters.map((chapter) => (
              <tr key={chapter.id}>
                <td>{chapter.number}</td>
                <td>{chapter.title ?? "-"}</td>
                <td>{chapter.status}</td>
                <td className="space-x-2 space-x-reverse">
                  <Link href={`/chapters/${chapter.id}`} className="text-blue-600">
                    مشاهده
                  </Link>
                  {canDelete && (
                    <form action={removeChapter} className="inline">
                      <input type="hidden" name="chapterId" value={chapter.id} />
                      <button className="text-xs text-red-600">حذف</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
