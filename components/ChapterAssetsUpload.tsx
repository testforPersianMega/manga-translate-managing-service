"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

type UploadStatus =
  | "CLIENT_UPLOADING"
  | "SERVER_RECEIVED"
  | "SERVER_VALIDATING"
  | "SERVER_UNZIPPING"
  | "SERVER_PROCESSING"
  | "SERVER_SAVING"
  | "DONE"
  | "ERROR";

type UploadState = {
  status: UploadStatus;
  percent: number | null;
  messageFa: string;
  isDone: boolean;
  isError: boolean;
};

type LatestJobResponse = { jobId: string | null } & Partial<UploadState>;

type UploadFormProps = {
  chapterId: string;
  maxSingleMb: number;
  maxZipMb: number;
};

const POLL_INTERVAL_MS = 900;

function formatPercent(value: number) {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value);
}

export function ChapterAssetsUpload({ chapterId, maxSingleMb, maxZipMb }: UploadFormProps) {
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const refreshedForJobRef = useRef<string | null>(null);
  const router = useRouter();

  const isBusy = useMemo(() => {
    if (!uploadState) return false;
    return !uploadState.isDone && !uploadState.isError;
  }, [uploadState]);

  useEffect(() => {
    let active = true;
    async function loadLatestJob() {
      try {
        const response = await fetch(`/api/uploads/latest?chapterId=${chapterId}`);
        if (!response.ok) return;
        const data = (await response.json()) as LatestJobResponse;
        if (!active || !data.jobId || !data.status || !data.messageFa) return;
        setJobId(data.jobId);
        setUploadState({
          status: data.status,
          percent: data.percent ?? null,
          messageFa: data.messageFa,
          isDone: data.isDone ?? false,
          isError: data.isError ?? false,
        });
      } catch {
        // ignore
      }
    }
    void loadLatestJob();
    return () => {
      active = false;
    };
  }, [chapterId]);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/uploads/${jobId}/status`);
        if (!response.ok) return;
        const data = (await response.json()) as UploadState;
        if (!active) return;
        setUploadState({
          status: data.status,
          percent: data.percent ?? null,
          messageFa: data.messageFa,
          isDone: data.isDone,
          isError: data.isError,
        });
        if (data.isDone || data.isError) {
          setJobId(null);
        }
      } catch {
        // ignore
      }
    };

    void poll();
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [jobId]);

  useEffect(() => {
    if (!uploadState?.isDone) return;
    if (jobId) return;
    if (refreshedForJobRef.current === "done") return;
    refreshedForJobRef.current = "done";
    router.refresh();
  }, [jobId, router, uploadState?.isDone]);

  const startUpload = (form: HTMLFormElement, uploadType: string) => {
    refreshedForJobRef.current = null;
    const formData = new FormData(form);
    const file = formData.get("file") as File | null;
    if (!file) {
      setUploadState({
        status: "ERROR",
        percent: null,
        messageFa: "ابتدا فایل را انتخاب کنید",
        isDone: false,
        isError: true,
      });
      return;
    }

    formData.set("uploadType", uploadType);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", `/api/chapters/${chapterId}/assets/upload`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      setUploadState({
        status: "CLIENT_UPLOADING",
        percent,
        messageFa: `در حال آپلود فایل‌ها… ${formatPercent(percent)}٪`,
        isDone: false,
        isError: false,
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = xhr.response as { jobId?: string; error?: string } | null;
        if (response?.jobId) {
          setUploadState({
            status: "SERVER_RECEIVED",
            percent: null,
            messageFa: "فایل‌ها با موفقیت دریافت شدند",
            isDone: false,
            isError: false,
          });
          setJobId(response.jobId);
          return;
        }
      }

      setUploadState({
        status: "ERROR",
        percent: null,
        messageFa: "خطا در ارسال فایل‌ها",
        isDone: false,
        isError: true,
      });
    };
    xhr.onerror = () => {
      setUploadState({
        status: "ERROR",
        percent: null,
        messageFa: "ارتباط با سرور برقرار نشد",
        isDone: false,
        isError: true,
      });
    };
    xhr.onabort = () => {
      setUploadState({
        status: "ERROR",
        percent: null,
        messageFa: "آپلود لغو شد",
        isDone: false,
        isError: true,
      });
    };
    xhr.send(formData);
  };

  const handleSubmit = (uploadType: string) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) return;
    startUpload(event.currentTarget, uploadType);
  };

  const handleCancel = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
  };

  const handleReset = () => {
    setUploadState(null);
    setJobId(null);
    refreshedForJobRef.current = null;
  };

  return (
    <div dir="rtl" className="grid gap-4 md:grid-cols-2">
      {uploadState && (
        <div className="card md:col-span-2">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">وضعیت آپلود</p>
              {uploadState.status === "CLIENT_UPLOADING" && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-600"
                >
                  لغو آپلود
                </button>
              )}
              {uploadState.isError && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs"
                >
                  بستن پیام
                </button>
              )}
            </div>

            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-blue-600 transition-all"
                style={{ width: `${uploadState.percent ?? 0}%` }}
              />
            </div>

            <p
              className={`text-sm ${
                uploadState.isError ? "text-red-600" : "text-gray-700"
              }`}
            >
              {uploadState.messageFa}
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="text-sm font-semibold">آپلود ZIP تصاویر</h3>
        <p className="mt-2 text-xs text-gray-500">
          حداکثر حجم {maxZipMb}MB. فقط تصاویر با نام‌گذاری مرتب.
        </p>
        <form onSubmit={handleSubmit("images_zip")} className="mt-4 space-y-3">
          <input name="file" type="file" accept="application/zip" disabled={isBusy} />
          <select name="mode" disabled={isBusy}>
            <option value="append">افزودن به انتها</option>
            <option value="replace_all">جایگزینی کامل</option>
            <option value="merge_by_filename">ادغام بر اساس نام فایل</option>
          </select>
          <button
            type="submit"
            disabled={isBusy}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            آپلود تصاویر
          </button>
        </form>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold">آپلود تک تصویر</h3>
        <p className="mt-2 text-xs text-gray-500">حداکثر حجم {maxSingleMb}MB.</p>
        <form onSubmit={handleSubmit("single_image")} className="mt-4 space-y-3">
          <input name="file" type="file" accept="image/*" disabled={isBusy} />
          <select name="mode" disabled={isBusy}>
            <option value="append">افزودن به انتها</option>
            <option value="insert">درج در شماره صفحه</option>
            <option value="replace">جایگزینی شماره صفحه</option>
          </select>
          <input
            name="pageIndex"
            type="number"
            min={1}
            placeholder="شماره صفحه"
            disabled={isBusy}
          />
          <button
            type="submit"
            disabled={isBusy}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            ثبت تصویر
          </button>
        </form>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold">آپلود ZIP JSON</h3>
        <p className="mt-2 text-xs text-gray-500">
          فایل‌ها باید فقط JSON باشند. تطبیق بر اساس نام فایل یا فیلد image انجام می‌شود.
        </p>
        <form onSubmit={handleSubmit("json_zip")} className="mt-4 space-y-3">
          <input name="file" type="file" accept="application/zip" disabled={isBusy} />
          <button
            type="submit"
            disabled={isBusy}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            آپلود JSON
          </button>
        </form>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold">آپلود تک JSON</h3>
        <form onSubmit={handleSubmit("single_json")} className="mt-4 space-y-3">
          <input name="file" type="file" accept="application/json" disabled={isBusy} />
          <input
            name="pageIndex"
            type="number"
            min={1}
            placeholder="شماره صفحه"
            disabled={isBusy}
          />
          <button
            type="submit"
            disabled={isBusy}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            ثبت JSON
          </button>
        </form>
      </div>

      <div className="card md:col-span-2">
        <h3 className="text-sm font-semibold">آپلود ترکیبی (تصاویر + JSON)</h3>
        <p className="mt-2 text-xs text-gray-500">
          ZIP می‌تواند شامل پوشه images و json یا فایل‌ها در ریشه باشد.
        </p>
        <form
          onSubmit={handleSubmit("combined_zip")}
          className="mt-4 flex flex-col gap-3 md:flex-row"
        >
          <input
            name="file"
            type="file"
            accept="application/zip"
            className="flex-1"
            disabled={isBusy}
          />
          <select name="mode" className="md:w-48" disabled={isBusy}>
            <option value="append">افزودن به انتها</option>
            <option value="replace_all">جایگزینی کامل</option>
            <option value="merge_by_filename">ادغام بر اساس نام فایل</option>
          </select>
          <button
            type="submit"
            disabled={isBusy}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            آپلود ترکیبی
          </button>
        </form>
      </div>
    </div>
  );
}
