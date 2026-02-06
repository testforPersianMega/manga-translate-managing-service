import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canViewChapter, getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { resolveStoragePath } from "@/lib/storage";

interface RouteParams {
  params: { jsonId: string };
}

export async function GET(_: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return new NextResponse("احراز هویت لازم است", { status: 401 });
  }

  const jsonRecord = await prisma.chapterPageJson.findUnique({
    where: { id: params.jsonId },
    include: { chapter: true },
  });

  if (!jsonRecord) {
    return new NextResponse("یافت نشد", { status: 404 });
  }

  const permissions = await getEffectivePermissions(user.id);
  if (!permissions.has(PERMISSIONS.CHAPTER_ASSETS_VIEW)) {
    return new NextResponse("عدم دسترسی", { status: 403 });
  }

  const canView = await canViewChapter(user, jsonRecord.chapter);
  if (!canView) {
    return new NextResponse("عدم دسترسی", { status: 403 });
  }

  try {
    const filePath = resolveStoragePath(jsonRecord.jsonPath);
    const stream = createReadStream(filePath);
    return new NextResponse(Readable.toWeb(stream) as BodyInit, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=\"${jsonRecord.jsonFileName}\"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return new NextResponse("فایل یافت نشد", { status: 404 });
  }
}
