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
};

type ChapterAction = (formData: FormData) => void | Promise<void>;

interface BookChaptersTableProps {
  chapters: ChapterRow[];
  canDelete: boolean;
  onDeleteChapter: ChapterAction;
  onBulkDelete: ChapterAction;
}

export default function BookChaptersTable({
  chapters,
  canDelete,
  onDeleteChapter,
  onBulkDelete,
}: BookChaptersTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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

  return (
    <form action={onBulkDelete} className="space-y-3">
      {canDelete && (
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
          <button
            type="submit"
            className="rounded-md bg-red-600 px-3 py-1 text-xs text-white disabled:bg-red-300"
            disabled={selectedIds.length === 0}
          >
            حذف انتخاب‌شده‌ها
          </button>
          <span className="text-xs text-gray-500">
            {selectedIds.length} مورد انتخاب شده
          </span>
        </div>
      )}
      <table className="table">
        <thead>
          <tr>
            {canDelete && <th className="w-10"></th>}
            <th>شماره</th>
            <th>عنوان</th>
            <th>وضعیت</th>
            <th>پیشرفت ترجمه</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {chapters.map((chapter) => (
            <tr key={chapter.id}>
              {canDelete && (
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
              <td>{chapter.number}</td>
              <td>{chapter.title ?? "-"}</td>
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
          ))}
        </tbody>
      </table>
      {canDelete && allSelected && (
        <p className="text-xs text-gray-500">همه چپترها انتخاب شده‌اند.</p>
      )}
    </form>
  );
}
