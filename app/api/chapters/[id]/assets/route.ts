import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canViewChapter, getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { logError } from "@/lib/error-logger";

interface RouteParams {
  params: { id: string };
}

export async function GET(_: Request, { params }: RouteParams) {
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
    if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_VIEW)) {
      return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
    }

    const canView = await canViewChapter(user, chapter);
    if (!canView) {
      return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
    }

    const assets = await prisma.chapterAsset.findMany({
      where: { chapterId: params.id },
      include: { pageJson: true },
      orderBy: { pageIndex: "asc" },
    });

    return NextResponse.json(
      assets.map((asset) => ({
        pageIndex: asset.pageIndex,
        fileName: asset.fileName,
        imageUrl: `/api/assets/image/${asset.id}`,
        jsonUrl: asset.pageJson ? `/api/assets/json/${asset.pageJson.id}` : null,
      })),
    );
  } catch (error) {
    await logError(error, `GET /api/chapters/${params.id}/assets`);
    return NextResponse.json({ error: "خطای داخلی سرور" }, { status: 500 });
  }
}
