import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { assertPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function NewRolePage() {
  const user = await getSessionUser();
  if (!user) return null;
  await assertPermission(user.id, PERMISSIONS.ROLE_CREATE);

  const permissions = await prisma.permission.findMany({ orderBy: { key: "asc" } });

  async function createRole(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "");
    const description = String(formData.get("description") || "");
    const permissionIds = formData.getAll("permissions").map(String);

    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.ROLE_CREATE);

    const role = await prisma.role.create({
      data: {
        name,
        description: description || null,
      },
    });

    if (permissionIds.length) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }

    redirect(`/roles/${role.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">ایجاد نقش جدید</h2>
        <p className="text-sm text-gray-500">دسترسی‌های نقش را انتخاب کنید.</p>
      </div>
      <form action={createRole} className="card space-y-4">
        <div className="space-y-2">
          <label>نام نقش</label>
          <input name="name" required />
        </div>
        <div className="space-y-2">
          <label>توضیحات</label>
          <input name="description" />
        </div>
        <div>
          <p className="text-sm font-semibold">دسترسی‌ها</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {permissions.map((permission) => (
              <label key={permission.id} className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="permissions" value={permission.id} />
                {permission.labelFa}
              </label>
            ))}
          </div>
        </div>
        <button className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
          ایجاد نقش
        </button>
      </form>
    </div>
  );
}
