import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canEditChapter, canViewChapter, getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { TranslationEditor } from "@/components/translation-editor/TranslationEditor";

interface TranslatePageProps {
  params: { id: string };
}

export default async function TranslatePage({ params }: TranslatePageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const chapter = await prisma.chapter.findUnique({
    where: { id: params.id },
    include: { book: true },
  });

  if (!chapter) {
    redirect("/books");
  }

  const permissions = await getEffectivePermissions(user.id);
  if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_VIEW)) {
    redirect(`/chapters/${params.id}`);
  }

  const canView = await canViewChapter(user, chapter);
  if (!canView) {
    redirect("/books");
  }

  const canEdit =
    (await canEditChapter(user, chapter)) ||
    permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPDATE);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        {chapter.book.titleFa} · چپتر {chapter.number} · Translation
      </h2>
      <TranslationEditor chapterId={params.id} canEdit={canEdit} />
    </div>
  );
}
