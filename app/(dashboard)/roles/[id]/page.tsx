import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { assertPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";

interface RoleDetailPageProps {
  params: { id: string };
}

export default async function RoleDetailPage({ params }: RoleDetailPageProps) {
  const user = await getSessionUser();
  if (!user) return null;
  await assertPermission(user.id, PERMISSIONS.ROLE_UPDATE);

  const role = await prisma.role.findUnique({
    where: { id: params.id },
    include: { rolePermissions: true },
  });

  if (!role) {
    redirect("/roles");
  }

  const permissions = await prisma.permission.findMany({ orderBy: { key: "asc" } });

  async function updateRole(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "");
    const description = String(formData.get("description") || "");
    const permissionIds = formData.getAll("permissions").map(String);

    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.ROLE_UPDATE);

    await prisma.$transaction([
      prisma.role.update({
        where: { id: params.id },
        data: { name, description: description || null },
      }),
      prisma.rolePermission.deleteMany({ where: { roleId: params.id } }),
      prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: params.id,
          permissionId,
        })),
      }),
    ]);
    redirect(`/roles/${params.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">ویرایش نقش</h2>
        <p className="text-sm text-gray-500">تغییر دسترسی‌های نقش</p>
      </div>
      <form action={updateRole} className="card space-y-4">
        <div className="space-y-2">
          <label>نام نقش</label>
          <input name="name" defaultValue={role.name} required />
        </div>
        <div className="space-y-2">
          <label>توضیحات</label>
          <input name="description" defaultValue={role.description ?? ""} />
        </div>
        <div>
          <p className="text-sm font-semibold">دسترسی‌ها</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {permissions.map((permission) => (
              <label key={permission.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="permissions"
                  value={permission.id}
                  defaultChecked={role.rolePermissions.some(
                    (item) => item.permissionId === permission.id,
                  )}
                />
                {permission.labelFa}
              </label>
            ))}
          </div>
        </div>
        <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
          ذخیره نقش
        </button>
      </form>
    </div>
  );
}
