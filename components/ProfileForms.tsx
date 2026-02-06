"use client";

import { useFormState, useFormStatus } from "react-dom";

type FormState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialState: FormState = { status: "idle", message: "" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-60"
      disabled={pending}
    >
      {pending ? "در حال پردازش..." : label}
    </button>
  );
}

export function ProfileForms({
  onUpdateName,
  onChangePassword,
  defaultName,
}: {
  onUpdateName: (state: FormState, formData: FormData) => Promise<FormState>;
  onChangePassword: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultName: string;
}) {
  const [nameState, nameAction] = useFormState(onUpdateName, initialState);
  const [passwordState, passwordAction] = useFormState(onChangePassword, initialState);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h3 className="text-sm font-semibold">ویرایش نام نمایشی</h3>
        <form action={nameAction} className="mt-4 space-y-3">
          <div className="space-y-2">
            <label>نام نمایشی</label>
            <input name="name" defaultValue={defaultName} placeholder="نام شما" />
          </div>
          {nameState.message && (
            <p
              className={`text-xs ${
                nameState.status === "error" ? "text-red-600" : "text-green-600"
              }`}
            >
              {nameState.message}
            </p>
          )}
          <SubmitButton label="ذخیره نام" />
        </form>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold">تغییر رمز عبور</h3>
        <form action={passwordAction} className="mt-4 space-y-3">
          <div className="space-y-2">
            <label>رمز عبور فعلی</label>
            <input name="currentPassword" type="password" />
          </div>
          <div className="space-y-2">
            <label>رمز عبور جدید</label>
            <input name="newPassword" type="password" />
          </div>
          <div className="space-y-2">
            <label>تکرار رمز عبور جدید</label>
            <input name="confirmPassword" type="password" />
          </div>
          {passwordState.message && (
            <p
              className={`text-xs ${
                passwordState.status === "error" ? "text-red-600" : "text-green-600"
              }`}
            >
              {passwordState.message}
            </p>
          )}
          <SubmitButton label="تغییر رمز" />
        </form>
      </div>
    </div>
  );
}
