import bcrypt from "bcrypt";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

interface InvitePageProps {
  params: { token: string };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const invite = await prisma.inviteToken.findUnique({
    where: { token: params.token },
  });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold">دعوت‌نامه نامعتبر است</h1>
          <p className="mt-2 text-sm text-gray-500">
            لینک دعوت منقضی شده یا قبلاً استفاده شده است.
          </p>
        </div>
      </div>
    );
  }

  async function setPassword(formData: FormData) {
    "use server";
    if (!invite) {
      throw new Error("دعوت‌نامه نامعتبر است.");
    }
    const name = String(formData.get("name") || "");
    const password = String(formData.get("password") || "");
    if (!password || password.length < 8) {
      throw new Error("رمز عبور باید حداقل ۸ کاراکتر باشد.");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.user.upsert({
        where: { email: invite.email },
        update: {
          name: name || null,
          passwordHash,
          isActive: true,
        },
        create: {
          name: name || null,
          email: invite.email,
          passwordHash,
          role: {
            connect: {
              name: "TRANSLATOR",
            },
          },
          isActive: true,
          scopeMode: "SELECTED_BOOKS",
        },
      }),
      prisma.inviteToken.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      }),
    ]);
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">تکمیل ثبت‌نام</h1>
        <p className="mt-2 text-sm text-gray-500">
          برای فعال‌سازی حساب خود رمز عبور تعیین کنید.
        </p>
        <form action={setPassword} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="name">نام</label>
            <input id="name" name="name" type="text" placeholder="نام نمایشی" />
          </div>
          <div className="space-y-2">
            <label htmlFor="password">رمز عبور جدید</label>
            <input
              id="password"
              name="password"
              type="password"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            فعال‌سازی حساب
          </button>
        </form>
      </div>
    </div>
  );
}
