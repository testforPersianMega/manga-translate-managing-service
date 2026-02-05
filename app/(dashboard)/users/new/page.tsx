import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { assertPermission } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import bcrypt from "bcrypt";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";

interface NewUserPageProps {
  searchParams?: { invite?: string };
}

export default async function NewUserPage({ searchParams }: NewUserPageProps) {
  const user = await getSessionUser();
  if (!user) return null;
  await assertPermission(user.id, PERMISSIONS.USER_CREATE);

  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  const inviteToken = searchParams?.invite;

  async function createUser(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "");
    const email = String(formData.get("email") || "").toLowerCase();
    const password = String(formData.get("password") || "");
    const roleId = String(formData.get("roleId"));
    const scopeMode = String(formData.get("scopeMode")) as
      | "ALL_BOOKS"
      | "SELECTED_BOOKS";
    const isActive = formData.get("isActive") === "on";

    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.USER_CREATE);

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        name: name || null,
        email,
        passwordHash,
        roleId,
        isActive,
        scopeMode,
      },
    });
    redirect("/users");
  }

  async function createInvite(formData: FormData) {
    "use server";
    const email = String(formData.get("inviteEmail") || "").toLowerCase();
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;
    await assertPermission(sessionUser.id, PERMISSIONS.USER_CREATE);

    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.inviteToken.create({
      data: {
        email,
        token,
        expiresAt,
      },
    });

    redirect(`/users/new?invite=${token}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">ایجاد کاربر جدید</h2>
        <p className="text-sm text-gray-500">
          می‌توانید کاربر را مستقیم بسازید یا دعوت‌نامه ارسال کنید.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="text-sm font-semibold">ایجاد مستقیم</h3>
          <form action={createUser} className="mt-4 space-y-4">
            <div className="space-y-2">
              <label>نام</label>
              <input name="name" placeholder="نام کاربر" />
            </div>
            <div className="space-y-2">
              <label>ایمیل</label>
              <input name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <label>رمز عبور</label>
              <input name="password" type="password" required />
            </div>
            <div className="space-y-2">
              <label>نقش</label>
              <select name="roleId" required>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label>محدوده کتاب</label>
              <select name="scopeMode" defaultValue="ALL_BOOKS">
                <option value="ALL_BOOKS">همه کتاب‌ها</option>
                <option value="SELECTED_BOOKS">کتاب‌های انتخابی</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input name="isActive" type="checkbox" defaultChecked />
              فعال باشد
            </label>
            <button className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
              ایجاد کاربر
            </button>
          </form>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold">ارسال دعوت‌نامه</h3>
          <form action={createInvite} className="mt-4 space-y-4">
            <div className="space-y-2">
              <label>ایمیل</label>
              <input name="inviteEmail" type="email" required />
            </div>
            <button className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm text-white">
              ساخت لینک دعوت
            </button>
          </form>
          {inviteToken && (
            <div className="mt-4 rounded-md border border-dashed border-gray-200 bg-gray-50 p-3 text-xs">
              <p className="font-semibold">لینک دعوت</p>
              <p className="mt-2 break-all">
                {process.env.NEXTAUTH_URL}/invite/{inviteToken}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
