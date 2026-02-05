import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { assertPermission, getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";

interface BooksPageProps {
  searchParams?: { q?: string; type?: string };
}

export default async function BooksPage({ searchParams }: BooksPageProps) {
  const user = await getSessionUser();
  if (!user) return null;
  await assertPermission(user.id, PERMISSIONS.BOOK_LIST);
  const permissions = await getEffectivePermissions(user.id);

  const query = searchParams?.q ?? "";
  const type = searchParams?.type ?? "";

  const bookWhere: Prisma.BookWhereInput = {
    AND: [
      query
        ? {
            OR: [
              { titleFa: { contains: query, mode: Prisma.QueryMode.insensitive } },
              { titleEn: { contains: query, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {},
      type ? { type: type as "MANGA" | "MANHWA" | "COMIC" } : {},
    ],
  };

  let books = await prisma.book.findMany({
    where: bookWhere,
    orderBy: { createdAt: "desc" },
  });

  if (user.scopeMode === "SELECTED_BOOKS" && user.roleId) {
    const role = await prisma.role.findUnique({ where: { id: user.roleId } });
    if (role?.name !== "ADMIN") {
      const access = await prisma.bookAccess.findMany({ where: { userId: user.id } });
      const allowedIds = new Set(access.map((item) => item.bookId));
      books = books.filter((book) => allowedIds.has(book.id));
    }
  }

  const canCreate = permissions.has(PERMISSIONS.BOOK_CREATE);

  async function createBook(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.BOOK_CREATE);

    const titleFa = String(formData.get("titleFa") || "");
    const titleEn = String(formData.get("titleEn") || "");
    const typeValue = String(formData.get("type")) as
      | "MANGA"
      | "MANHWA"
      | "COMIC";

    await prisma.book.create({
      data: {
        titleFa,
        titleEn: titleEn || null,
        type: typeValue,
      },
    });
    redirect("/books");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">کتاب‌ها</h2>
          <p className="text-sm text-gray-500">مدیریت پروژه‌های ترجمه</p>
        </div>
        {canCreate && (
          <details className="card">
            <summary className="cursor-pointer text-sm font-semibold">
              ایجاد کتاب جدید
            </summary>
            <form action={createBook} className="mt-4 space-y-3">
              <input name="titleFa" placeholder="عنوان فارسی" required />
              <input name="titleEn" placeholder="عنوان انگلیسی" />
              <select name="type" defaultValue="MANGA">
                <option value="MANGA">مانگا</option>
                <option value="MANHWA">مانهوا</option>
                <option value="COMIC">کمیک</option>
              </select>
              <button className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
                ثبت کتاب
              </button>
            </form>
          </details>
        )}
      </div>

      <form className="card flex flex-col gap-3 md:flex-row md:items-center">
        <input name="q" placeholder="جستجوی عنوان" defaultValue={query} />
        <select name="type" defaultValue={type}>
          <option value="">همه انواع</option>
          <option value="MANGA">مانگا</option>
          <option value="MANHWA">مانهوا</option>
          <option value="COMIC">کمیک</option>
        </select>
        <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
          فیلتر
        </button>
      </form>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>عنوان</th>
              <th>نوع</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr key={book.id}>
                <td>{book.titleFa}</td>
                <td>{book.type}</td>
                <td>
                  <Link href={`/books/${book.id}`} className="text-blue-600">
                    جزئیات
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
