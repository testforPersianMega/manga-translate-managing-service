import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { assertPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";

interface UsersPageProps {
  searchParams?: { q?: string };
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const user = await getSessionUser();
  if (!user) return null;
  await assertPermission(user.id, PERMISSIONS.USER_LIST);

  const query = searchParams?.q ?? "";

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    include: { role: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">کاربران</h2>
          <p className="text-sm text-gray-500">مدیریت اعضای سیستم</p>
        </div>
        <Link
          href="/users/new"
          className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white"
        >
          ایجاد کاربر
        </Link>
      </div>

      <form className="card flex flex-col gap-3 md:flex-row md:items-center">
        <input
          name="q"
          placeholder="جستجو بر اساس نام یا ایمیل"
          defaultValue={query}
          className="flex-1"
        />
        <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
          جستجو
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>نام</th>
              <th>ایمیل</th>
              <th>نقش</th>
              <th>وضعیت</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.id}>
                <td>{item.name || "-"}</td>
                <td>{item.email}</td>
                <td>{item.role.name}</td>
                <td>
                  {item.isActive ? (
                    <span className="badge badge-success">فعال</span>
                  ) : (
                    <span className="badge badge-muted">غیرفعال</span>
                  )}
                </td>
                <td>
                  <Link
                    href={`/users/${item.id}`}
                    className="text-sm text-blue-600"
                  >
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
