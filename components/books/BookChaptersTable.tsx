"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ChapterRow = {
  id: string;
  number: string;
  title: string | null;
  status: string;
  translatedPages: number;
  totalPages: number;
  assignedToUserId: string | null;
  assignedToUserName: string | null;
};

type ChapterAction = (formData: FormData) => void | Promise<void>;

type AssignableUser = {
  id: string;
  name: string | null;
  email: string;
};

interface BookChaptersTableProps {
  chapters: ChapterRow[];
  canDelete: boolean;
  canAssign: boolean;
  canChangeStatus: boolean;
  assignableUsers: AssignableUser[];
  currentUserId: string;
  onDeleteChapter: ChapterAction;
  onBulkDelete: ChapterAction;
  onBulkUpdate: ChapterAction;
}

export default function BookChaptersTable({
  chapters,
  canDelete,
  canAssign,
  canChangeStatus,
  assignableUsers,
  currentUserId,
  onDeleteChapter,
  onBulkDelete,
  onBulkUpdate,
}: BookChaptersTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const canSelect = canDelete || canAssign || canChangeStatus;
  const canBulkUpdate = canAssign || canChangeStatus;

  const allSelected = useMemo(
    () => chapters.length > 0 && selectedIds.length === chapters.length,
    [chapters.length, selectedIds.length],
  );

  const toggleSelection = (chapterId: string) => {
    setSelectedIds((prev) =>
      prev.includes(chapterId) ? prev.filter((id) => id !== chapterId) : [...prev, chapterId],
    );
  };

  const handleSelectAll = () => {
    setSelectedIds(chapters.map((chapter) => chapter.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const defaultAction = canBulkUpdate ? onBulkUpdate : onBulkDelete;

  return (
    <form action={defaultAction} className="space-y-3">
      {canSelect && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            className="rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-700"
          >
            انتخاب همه
          </button>
          <button
            type="button"
            onClick={handleDeselectAll}
            className="rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-700"
          >
            لغو انتخاب همه
          </button>
          {canDelete && (
            <button
              type="submit"
              formAction={onBulkDelete}
              className="rounded-md bg-red-600 px-3 py-1 text-xs text-white disabled:bg-red-300"
              disabled={selectedIds.length === 0}
            >
              حذف انتخاب‌شده‌ها
            </button>
          )}
          <span className="text-xs text-gray-500">
            {selectedIds.length} مورد انتخاب شده
          </span>
        </div>
      )}
      {canBulkUpdate && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 bg-gray-50 p-3 text-xs">
          {canChangeStatus && (
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">تغییر وضعیت</span>
              <select name="status" defaultValue="keep" className="text-xs">
                <option value="keep">بدون تغییر</option>
                <option value="AVAILABLE">آزاد</option>
                <option value="CLAIMED">برداشته شده</option>
                <option value="IN_PROGRESS">در حال انجام</option>
                <option value="DONE">انجام شده</option>
              </select>
            </label>
          )}
          {canAssign && (
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">تخصیص</span>
              <select name="assignedToUserId" defaultValue="keep" className="text-xs">
                <option value="keep">بدون تغییر</option>
                <option value="none">بدون تخصیص</option>
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name ?? user.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="submit"
            formAction={onBulkUpdate}
            className="rounded-md bg-gray-900 px-3 py-1 text-xs text-white disabled:bg-gray-400"
            disabled={selectedIds.length === 0}
          >
            اعمال تغییرات
          </button>
        </div>
      )}
      <table className="table">
        <thead>
          <tr>
            {canSelect && <th className="w-10"></th>}
            <th>شماره</th>
            <th>عنوان</th>
            <th>تخصیص</th>
            <th>وضعیت</th>
            <th>پیشرفت ترجمه</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {chapters.map((chapter) => {
            const isMine = chapter.assignedToUserId === currentUserId;
            return (
              <tr key={chapter.id} className={isMine ? "bg-emerald-50" : undefined}>
                {canSelect && (
                  <td>
                    <input
                      type="checkbox"
                      name="chapterIds"
                      value={chapter.id}
                      checked={selectedIds.includes(chapter.id)}
                      onChange={() => toggleSelection(chapter.id)}
                      aria-label={`انتخاب چپتر ${chapter.number}`}
                    />
                  </td>
                )}
                <td className="space-x-2 space-x-reverse">
                  <span>{chapter.number}</span>
                  {isMine && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">
                      <span aria-hidden="true">★</span>
                      چپتر شما
                    </span>
                  )}
                </td>
                <td>{chapter.title ?? "-"}</td>
                <td>{isMine ? "شما" : chapter.assignedToUserName ?? "-"}</td>
                <td>{chapter.status}</td>
                <td>
                  {chapter.translatedPages}/{chapter.totalPages}
                </td>
                <td className="space-x-2 space-x-reverse">
                  <Link href={`/chapters/${chapter.id}`} className="text-blue-600">
                    مشاهده
                  </Link>
                  {canDelete && (
                    <button
                      type="submit"
                      formAction={onDeleteChapter}
                      name="chapterId"
                      value={chapter.id}
                      className="text-xs text-red-600"
                    >
                      حذف
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {canSelect && allSelected && (
        <p className="text-xs text-gray-500">همه چپترها انتخاب شده‌اند.</p>
      )}
    </form>
  );
}
