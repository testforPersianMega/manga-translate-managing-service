import { redirect } from "next/navigation";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ProfileForms } from "@/components/ProfileForms";
import { ProfileLogoutButton } from "@/components/ProfileLogoutButton";

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "نام باید حداقل ۲ کاراکتر باشد")
    .max(50, "نام نباید بیشتر از ۵۰ کاراکتر باشد")
    .optional()
    .or(z.literal("")),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "رمز عبور فعلی الزامی است"),
    newPassword: z.string().min(8, "رمز عبور جدید باید حداقل ۸ کاراکتر باشد"),
    confirmPassword: z.string().min(1, "تکرار رمز عبور الزامی است"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "تکرار رمز عبور با رمز جدید یکسان نیست",
    path: ["confirmPassword"],
  });

type FormState = {
  status: "idle" | "success" | "error";
  message: string;
};

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  async function updateName(_: FormState, formData: FormData): Promise<FormState> {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return { status: "error", message: "ابتدا وارد شوید" };
    }

    const rawName = String(formData.get("name") ?? "");
    const parsed = nameSchema.safeParse({ name: rawName });
    if (!parsed.success) {
      return { status: "error", message: parsed.error.errors[0]?.message ?? "خطا" };
    }

    const name = rawName.trim();
    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { name: name || null },
    });

    return { status: "success", message: "نام نمایشی با موفقیت به‌روزرسانی شد" };
  }

  async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return { status: "error", message: "ابتدا وارد شوید" };
    }

    const parsed = passwordSchema.safeParse({
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    });

    if (!parsed.success) {
      return { status: "error", message: parsed.error.errors[0]?.message ?? "خطا" };
    }

    const isValid = await bcrypt.compare(parsed.data.currentPassword, sessionUser.passwordHash);
    if (!isValid) {
      return { status: "error", message: "رمز عبور فعلی صحیح نیست" };
    }

    const hashed = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { passwordHash: hashed },
    });

    return { status: "success", message: "رمز عبور با موفقیت تغییر کرد" };
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">پروفایل کاربری</h2>
        <p className="text-sm text-gray-500">مدیریت اطلاعات حساب شما</p>
      </div>

      <div className="card space-y-2">
        <p className="text-sm">نام: {user.name ?? "-"}</p>
        <p className="text-sm">ایمیل: {user.email}</p>
        <p className="text-sm">نقش: {user.role.name}</p>
        <p className="text-sm">وضعیت: {user.isActive ? "فعال" : "غیرفعال"}</p>
        <p className="text-sm">
          تاریخ ایجاد: {new Intl.DateTimeFormat("fa-IR").format(user.createdAt)}
        </p>
      </div>

      <ProfileForms
        onUpdateName={updateName}
        onChangePassword={changePassword}
        defaultName={user.name ?? ""}
      />

      <div className="card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold">خروج از حساب</p>
          <p className="text-xs text-gray-500">
            برای پایان دادن به جلسه فعلی می‌توانید از حساب خارج شوید.
          </p>
        </div>
        <ProfileLogoutButton />
      </div>
    </div>
  );
}
