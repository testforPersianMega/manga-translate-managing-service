import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { redirectIfNoPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";

export default async function RolesPage() {
  const user = await getSessionUser();
  if (!user) return null;
  await redirectIfNoPermission(user.id, PERMISSIONS.ROLE_LIST, "/");

  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">نقش‌ها</h2>
          <p className="text-sm text-gray-500">تعریف نقش‌های سیستم</p>
        </div>
        <Link
          href="/roles/new"
          className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white"
        >
          ایجاد نقش
        </Link>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>نام نقش</th>
              <th>تعداد کاربران</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td>{role.name}</td>
                <td>{role._count.users}</td>
                <td>
                  <Link href={`/roles/${role.id}`} className="text-blue-600">
                    ویرایش
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
