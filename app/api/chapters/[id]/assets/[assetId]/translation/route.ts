import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canEditChapter, getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { logError } from "@/lib/error-logger";

interface RouteParams {
  params: { id: string; assetId: string };
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
    }

    const chapter = await prisma.chapter.findUnique({ where: { id: params.id } });
    if (!chapter) {
      return NextResponse.json({ error: "چپتر یافت نشد" }, { status: 404 });
    }

    const permissions = await getEffectivePermissions(user.id);
    if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPDATE)) {
      return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
    }

    const canEdit = await canEditChapter(user, chapter);
    if (!canEdit) {
      return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
    }

    const asset = await prisma.chapterAsset.findUnique({ where: { id: params.assetId } });
    if (!asset || asset.chapterId !== chapter.id) {
      return NextResponse.json({ error: "دارایی یافت نشد" }, { status: 404 });
    }

    const body = (await request.json()) as { isTranslated?: boolean };
    const isTranslated = Boolean(body?.isTranslated);

    const updated = await prisma.chapterAsset.update({
      where: { id: asset.id },
      data: { isTranslated },
    });

    return NextResponse.json({ isTranslated: updated.isTranslated });
  } catch (error) {
    await logError(
      error,
      `POST /api/chapters/${params.id}/assets/${params.assetId}/translation`,
    );
    return NextResponse.json({ error: "خطای داخلی سرور" }, { status: 500 });
  }
}
