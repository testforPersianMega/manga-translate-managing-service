import { NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canEditChapter, canViewChapter, getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { logError } from "@/lib/error-logger";
import { writeStorageFile } from "@/lib/storage";

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

    const canView = await canViewChapter(user, chapter);
    if (!canView) {
      return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
    }

    const asset = await prisma.chapterAsset.findFirst({
      where: { id: params.assetId, chapterId: params.id },
    });
    if (!asset) {
      return NextResponse.json({ error: "دارایی یافت نشد" }, { status: 404 });
    }

    const body = (await request.json()) as { json?: Record<string, unknown> };
    if (!body.json || typeof body.json !== "object") {
      return NextResponse.json({ error: "داده نامعتبر است" }, { status: 400 });
    }

    const existing = await prisma.chapterPageJson.findUnique({
      where: { assetId: asset.id },
    });

    const fileName = existing?.jsonFileName ?? `${path.parse(asset.fileName).name}.json`;
    const filePath =
      existing?.jsonPath ??
      path.posix.join("chapters", params.id, "json", `${asset.id}.json`);

    const buffer = Buffer.from(JSON.stringify(body.json, null, 2));
    await writeStorageFile(filePath, buffer);

    if (existing) {
      await prisma.chapterPageJson.update({
        where: { id: existing.id },
        data: {
          jsonPath: filePath,
          jsonFileName: fileName,
          size: buffer.length,
        },
      });
    } else {
      await prisma.chapterPageJson.create({
        data: {
          chapterId: params.id,
          assetId: asset.id,
          jsonPath: filePath,
          jsonFileName: fileName,
          size: buffer.length,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    await logError(error, `POST /api/chapters/${params.id}/assets/${params.assetId}/json`);
    return NextResponse.json({ error: "خطای داخلی سرور" }, { status: 500 });
  }
}
