"use client";

import { useFormState, useFormStatus } from "react-dom";

type BulkReport = {
  chapterId: string;
  images: number;
  jsons: number;
  error?: string;
};

type BulkState = {
  status: "idle" | "success" | "error";
  message: string;
  report: BulkReport[];
};

const initialState: BulkState = { status: "idle", message: "", report: [] };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-60"
      disabled={pending}
    >
      {pending ? "در حال پردازش..." : "شروع آپلود انبوه"}
    </button>
  );
}

export function BulkUploadForm({
  action,
}: {
  action: (state: BulkState, formData: FormData) => Promise<BulkState>;
}) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <input name="zip" type="file" accept="application/zip" />
        <select name="mode">
          <option value="append">افزودن به انتها</option>
          <option value="replace_all">جایگزینی کامل</option>
          <option value="merge_by_filename">ادغام بر اساس نام فایل</option>
        </select>
        <SubmitButton />
      </form>

      {state.message && (
        <p
          className={`text-xs ${
            state.status === "error" ? "text-red-600" : "text-green-600"
          }`}
        >
          {state.message}
        </p>
      )}

      {state.report.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">گزارش پردازش:</p>
          <ul className="space-y-1 text-xs">
            {state.report.map((item) => (
              <li key={item.chapterId}>
                چپتر {item.chapterId}: تصاویر {item.images} · JSON {item.jsons}
                {item.error ? ` · خطا: ${item.error}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
