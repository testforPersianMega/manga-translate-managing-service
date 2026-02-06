import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { assertPermission, getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import bcrypt from "bcrypt";
import { z } from "zod";

interface UserDetailPageProps {
  params: { id: string };
}

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  await assertPermission(sessionUser.id, PERMISSIONS.USER_VIEW);

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      role: true,
      permissionGrants: { include: { permission: true } },
      permissionDenies: { include: { permission: true } },
      bookAccess: { include: { book: true } },
    },
  });

  if (!user) {
    redirect("/users");
  }

  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  const permissions = await prisma.permission.findMany({ orderBy: { key: "asc" } });
  const books = await prisma.book.findMany({ orderBy: { titleFa: "asc" } });
  const effectivePermissions = await getEffectivePermissions(user.id);
  const actorPermissions = await getEffectivePermissions(sessionUser.id);
  const canResetPassword = actorPermissions.has(PERMISSIONS.USER_RESET_PASSWORD);

  async function updateUser(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "");
    const roleId = String(formData.get("roleId"));
    const isActive = formData.get("isActive") === "on";

    const actor = await getSessionUser();
    if (!actor) return;
    await assertPermission(actor.id, PERMISSIONS.USER_UPDATE);

    await prisma.user.update({
      where: { id: params.id },
      data: { name: name || null, roleId, isActive },
    });
    redirect(`/users/${params.id}`);
  }

  async function updateOverrides(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) return;
    await assertPermission(actor.id, PERMISSIONS.USER_MANAGE_OVERRIDES);

    const grants = formData.getAll("grants").map(String);
    const denies = formData.getAll("denies").map(String);

    await prisma.$transaction([
      prisma.userPermissionGrant.deleteMany({ where: { userId: params.id } }),
      prisma.userPermissionDeny.deleteMany({ where: { userId: params.id } }),
      prisma.userPermissionGrant.createMany({
        data: grants.map((permissionId) => ({
          userId: params.id,
          permissionId,
        })),
      }),
      prisma.userPermissionDeny.createMany({
        data: denies.map((permissionId) => ({
          userId: params.id,
          permissionId,
        })),
      }),
    ]);
    redirect(`/users/${params.id}`);
  }

  async function updateScope(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) return;
    await assertPermission(actor.id, PERMISSIONS.USER_MANAGE_BOOK_SCOPE);

    const scopeMode = String(formData.get("scopeMode")) as
      | "ALL_BOOKS"
      | "SELECTED_BOOKS";
    const selectedBooks = formData.getAll("books").map(String);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: params.id },
        data: { scopeMode },
      }),
      prisma.bookAccess.deleteMany({ where: { userId: params.id } }),
      prisma.bookAccess.createMany({
        data: selectedBooks.map((bookId) => ({
          userId: params.id,
          bookId,
        })),
      }),
    ]);
    redirect(`/users/${params.id}`);
  }

  async function resetPassword(formData: FormData) {
    "use server";
    const actor = await getSessionUser();
    if (!actor) return;
    await assertPermission(actor.id, PERMISSIONS.USER_RESET_PASSWORD);

    const schema = z
      .object({
        newPassword: z.string().min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد"),
        confirmPassword: z.string().min(1, "تکرار رمز عبور الزامی است"),
      })
      .refine((data) => data.newPassword === data.confirmPassword, {
        message: "تکرار رمز عبور با رمز جدید یکسان نیست",
        path: ["confirmPassword"],
      });

    const parsed = schema.safeParse({
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    });

    if (!parsed.success) {
      throw new Error(parsed.error.errors[0]?.message ?? "اطلاعات نامعتبر");
    }

    const hashed = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: params.id },
        data: { passwordHash: hashed },
      }),
      prisma.activityLog.create({
        data: {
          actorUserId: actor.id,
          targetUserId: params.id,
          action: "USER_RESET_PASSWORD",
          metadata: { via: "admin_panel" },
        },
      }),
    ]);
    redirect(`/users/${params.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">جزئیات کاربر</h2>
        <p className="text-sm text-gray-500">مدیریت نقش و دسترسی‌ها</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="text-sm font-semibold">اطلاعات پایه</h3>
          <form action={updateUser} className="mt-4 space-y-4">
            <div className="space-y-2">
              <label>نام</label>
              <input name="name" defaultValue={user.name ?? ""} />
            </div>
            <div className="space-y-2">
              <label>ایمیل</label>
              <input value={user.email} disabled />
            </div>
            <div className="space-y-2">
              <label>نقش</label>
              <select name="roleId" defaultValue={user.roleId}>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input name="isActive" type="checkbox" defaultChecked={user.isActive} />
              فعال باشد
            </label>
            <button className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
              ذخیره تغییرات
            </button>
          </form>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold">دسترسی‌های موثر</h3>
          <p className="mt-2 text-xs text-gray-500">
            دسترسی‌های نهایی پس از اعمال نقش و overrides
          </p>
          <ul className="mt-4 max-h-64 space-y-1 overflow-auto text-xs">
            {[...effectivePermissions].map((permission) => (
              <li key={permission}>{permission}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="text-sm font-semibold">مدیریت دسترسی‌های اضافی/سلبی</h3>
          <form action={updateOverrides} className="mt-4 space-y-4">
            <div>
              <p className="text-xs text-gray-500">اعطای اضافی</p>
              <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                {permissions.map((permission) => (
                  <label key={permission.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="grants"
                      value={permission.id}
                      defaultChecked={user.permissionGrants.some(
                        (item) => item.permissionId === permission.id,
                      )}
                    />
                    {permission.labelFa}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500">سلب دسترسی</p>
              <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                {permissions.map((permission) => (
                  <label key={permission.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="denies"
                      value={permission.id}
                      defaultChecked={user.permissionDenies.some(
                        (item) => item.permissionId === permission.id,
                      )}
                    />
                    {permission.labelFa}
                  </label>
                ))}
              </div>
            </div>
            <button className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
              ذخیره Overrides
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="text-sm font-semibold">محدوده کتاب‌ها</h3>
            <form action={updateScope} className="mt-4 space-y-4">
              <div className="space-y-2">
                <label>نوع محدوده</label>
                <select name="scopeMode" defaultValue={user.scopeMode}>
                  <option value="ALL_BOOKS">همه کتاب‌ها</option>
                  <option value="SELECTED_BOOKS">کتاب‌های انتخابی</option>
                </select>
              </div>
              <div className="max-h-48 space-y-2 overflow-auto">
                {books.map((book) => (
                  <label key={book.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="books"
                      value={book.id}
                      defaultChecked={user.bookAccess.some(
                        (access) => access.bookId === book.id,
                      )}
                    />
                    {book.titleFa}
                  </label>
                ))}
              </div>
              <button className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
                ذخیره محدوده
              </button>
            </form>
          </div>

          {canResetPassword && (
            <div className="card">
              <h3 className="text-sm font-semibold">بازنشانی رمز عبور</h3>
              <p className="mt-2 text-xs text-gray-500">
                این عملیات بدون نیاز به رمز فعلی انجام می‌شود.
              </p>
              <form action={resetPassword} className="mt-4 space-y-3">
                <input name="newPassword" type="password" placeholder="رمز عبور جدید" />
                <input
                  name="confirmPassword"
                  type="password"
                  placeholder="تکرار رمز عبور جدید"
                />
                <button className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
                  ثبت رمز جدید
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
