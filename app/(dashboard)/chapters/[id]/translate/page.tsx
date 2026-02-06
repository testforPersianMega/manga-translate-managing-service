import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  canAccessBook,
  canEditChapter,
  canViewChapter,
  getEffectivePermissions,
} from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";
import TranslationEditor from "@/components/translation-editor/TranslationEditor";

interface TranslatePageProps {
  params: { id: string };
}

export default async function TranslatePage({ params }: TranslatePageProps) {
  const user = await getSessionUser();
  if (!user) return null;

  const chapter = await prisma.chapter.findUnique({
    where: { id: params.id },
    include: { book: true },
  });

  if (!chapter) {
    redirect("/books");
  }

  const canAccess = await canAccessBook(user, chapter.bookId);
  if (!canAccess) {
    redirect("/books");
  }

  const canView = await canViewChapter(user, chapter);
  if (!canView) {
    redirect("/books");
  }

  const permissions = await getEffectivePermissions(user.id);
  if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_VIEW)) {
    redirect(`/chapters/${params.id}`);
  }

  const canEdit =
    (await canEditChapter(user, chapter)) &&
    permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPDATE);

  return (
    <div className="space-y-4" style={{ direction: "ltr" }}>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Translation Editor</h2>
        <p className="text-sm text-gray-500">
          Chapter {chapter.number} · {chapter.book.titleEn ?? chapter.book.titleFa}
        </p>
        {!canEdit && (
          <p className="mt-2 text-sm text-amber-600">
            You have read-only access. Editing and saving are disabled.
          </p>
        )}
      </div>

      <TranslationEditor chapterId={params.id} canEdit={canEdit} />
    </div>
  );
}
