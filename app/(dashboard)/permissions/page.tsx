import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { assertPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";

export default async function PermissionsPage() {
  const user = await getSessionUser();
  if (!user) return null;
  await assertPermission(user.id, PERMISSIONS.ROLE_VIEW);

  const permissions = await prisma.permission.findMany({ orderBy: { group: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">کاتالوگ دسترسی‌ها</h2>
        <p className="text-sm text-gray-500">
          لیست دسترسی‌های قابل تخصیص در سیستم
        </p>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>کلید</th>
              <th>عنوان</th>
              <th>گروه</th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((permission) => (
              <tr key={permission.id}>
                <td>{permission.key}</td>
                <td>{permission.labelFa}</td>
                <td>{permission.group}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
