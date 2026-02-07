import path from "path";
import { createReadStream, createWriteStream, promises as fs } from "fs";
import { Readable } from "stream";
import archiver from "archiver";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canViewChapter, getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { resolveStoragePath, deleteStorageFile } from "@/lib/storage";

const ZIP_TTL_MS = Number(process.env.CHAPTER_ASSETS_ZIP_TTL_MS ?? 10 * 60 * 1000);

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) {
    return new NextResponse("احراز هویت لازم است", { status: 401 });
  }

  const permissions = await getEffectivePermissions(user.id);
  if (
    !permissions.has(PERMISSIONS.CHAPTER_ASSETS_VIEW) ||
    !permissions.has(PERMISSIONS.CHAPTER_ASSETS_DOWNLOAD)
  ) {
    return new NextResponse("عدم دسترسی", { status: 403 });
  }

  const chapter = await prisma.chapter.findUnique({ where: { id: params.id } });
  if (!chapter) {
    return new NextResponse("چپتر یافت نشد", { status: 404 });
  }

  const allowed = await canViewChapter(user, chapter);
  if (!allowed) {
    return new NextResponse("عدم دسترسی", { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "both";
  const includeImages = type === "images" || type === "both";
  const includeJson = type === "json" || type === "both";

  if (!includeImages && !includeJson) {
    return new NextResponse("درخواست نامعتبر است", { status: 400 });
  }

  const assets = await prisma.chapterAsset.findMany({
    where: { chapterId: chapter.id },
    include: { pageJson: true },
    orderBy: { pageIndex: "asc" },
  });

  const entries: { absolutePath: string; name: string }[] = [];

  if (includeImages) {
    for (const asset of assets) {
      const absolutePath = resolveStoragePath(asset.filePath);
      try {
        await fs.access(absolutePath);
        entries.push({
          absolutePath,
          name: path.posix.join("images", asset.fileName),
        });
      } catch {
        continue;
      }
    }
  }

  if (includeJson) {
    for (const asset of assets) {
      if (!asset.pageJson) continue;
      const absolutePath = resolveStoragePath(asset.pageJson.jsonPath);
      try {
        await fs.access(absolutePath);
        entries.push({
          absolutePath,
          name: path.posix.join("json", asset.pageJson.jsonFileName),
        });
      } catch {
        continue;
      }
    }
  }

  if (entries.length === 0) {
    return new NextResponse("فایلی برای دانلود یافت نشد", { status: 404 });
  }

  const exportRelativeDir = path.posix.join("exports", "chapters", chapter.id);
  const exportDir = resolveStoragePath(exportRelativeDir);
  await fs.mkdir(exportDir, { recursive: true });

  const fileName = `chapter-${chapter.id}-${type}-${Date.now()}.zip`;
  const zipRelativePath = path.posix.join(exportRelativeDir, fileName);
  const zipAbsolutePath = resolveStoragePath(zipRelativePath);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipAbsolutePath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", (error) => reject(error));
    archive.pipe(output);
    for (const entry of entries) {
      archive.file(entry.absolutePath, { name: entry.name });
    }
    archive.finalize();
  });

  setTimeout(() => {
    deleteStorageFile(zipRelativePath).catch(() => undefined);
  }, ZIP_TTL_MS);

  const stream = Readable.toWeb(createReadStream(zipAbsolutePath));
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
