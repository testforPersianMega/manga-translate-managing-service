import path from "path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import {
  canAccessBook,
  canEditChapter,
  canViewChapter,
  getEffectivePermissions,
} from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import {
  MAX_SINGLE_FILE_MB,
  MAX_ZIP_FILE_MB,
  assertFileSize,
  deleteAssetWithFiles,
  deleteChapterAssets,
  deleteJsonWithFile,
  detectImageMime,
  getBaseName,
  isImageFile,
  isJsonFile,
  parseZipEntries,
  saveImageToStorage,
  saveJsonToStorage,
  sortImageEntries,
} from "@/lib/chapter-assets";
import { deleteStorageFile } from "@/lib/storage";
import { logError } from "@/lib/error-logger";
import { BulkUploadForm } from "@/components/BulkUploadForm";
import { ChapterAssetsUpload } from "@/components/ChapterAssetsUpload";
import { ChapterAssetsGrid } from "@/components/ChapterAssetsGrid";

type ImageMode = "append" | "replace_all" | "merge_by_filename";

type BulkState = {
  status: "idle" | "success" | "error";
  message: string;
  report: { chapterId: string; images: number; jsons: number; error?: string }[];
};

async function requireChapterAccess(userId: string, chapterId: string) {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) {
    throw new Error("چپتر یافت نشد");
  }
  return chapter;
}

async function assertAssetPermission(
  userId: string,
  chapterId: string,
  permission: string,
  type: "view" | "edit",
) {
  const chapter = await requireChapterAccess(userId, chapterId);
  const permissions = await getEffectivePermissions(userId);
  if (!permissions.has(permission)) {
    throw new Error("عدم دسترسی لازم");
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("کاربر یافت نشد");
  }
  const allowed =
    type === "view" ? await canViewChapter(user, chapter) : await canEditChapter(user, chapter);
  if (!allowed) {
    throw new Error("عدم دسترسی لازم");
  }
  return chapter;
}

async function processImageEntries(
  chapterId: string,
  entries: Awaited<ReturnType<typeof parseZipEntries>>,
  mode: ImageMode,
) {
  if (!entries.length) {
    throw new Error("هیچ تصویری در فایل ZIP پیدا نشد");
  }

  if (!entries.every((entry) => isImageFile(entry.fileName))) {
    throw new Error("ZIP باید فقط شامل تصاویر باشد");
  }

  const sorted = sortImageEntries(entries);

  const existingAssets = await prisma.chapterAsset.findMany({ where: { chapterId } });
  const existingByFileName = new Map(
    existingAssets.map((asset) => [asset.fileName, asset]),
  );
  const maxIndex = existingAssets.reduce(
    (max, asset) => Math.max(max, asset.pageIndex),
    0,
  );

  if (mode === "replace_all") {
    await deleteChapterAssets(chapterId);
  }

  let nextIndex = mode === "append" ? maxIndex + 1 : 1;
  if (mode === "merge_by_filename") {
    nextIndex = maxIndex + 1;
  }

  const createdFiles: string[] = [];
  try {
    for (const entry of sorted) {
      const mime = await detectImageMime(entry.buffer);
      if (!mime) {
        throw new Error(`نوع فایل ${entry.fileName} معتبر نیست`);
      }

      if (mode === "merge_by_filename" && existingByFileName.has(entry.fileName)) {
        const asset = existingByFileName.get(entry.fileName)!;
        const filePath = await saveImageToStorage(chapterId, entry.fileName, entry.buffer);
        createdFiles.push(filePath);
        await prisma.chapterAsset.update({
          where: { id: asset.id },
          data: {
            filePath,
            fileName: entry.fileName,
            mimeType: mime,
            size: entry.buffer.length,
          },
        });
        continue;
      }

      const filePath = await saveImageToStorage(chapterId, entry.fileName, entry.buffer);
      createdFiles.push(filePath);
      await prisma.chapterAsset.create({
        data: {
          chapterId,
          pageIndex: nextIndex,
          filePath,
          fileName: entry.fileName,
          mimeType: mime,
          size: entry.buffer.length,
        },
      });
      nextIndex += 1;
    }
  } catch (error) {
    await logError(error, "processImageEntries");
    await Promise.all(createdFiles.map((file) => deleteStorageFile(file)));
    throw error;
  }
}

async function processJsonEntries(
  chapterId: string,
  entries: Awaited<ReturnType<typeof parseZipEntries>>,
) {
  if (!entries.length) {
    throw new Error("هیچ فایل JSON در ZIP پیدا نشد");
  }
  if (!entries.every((entry) => isJsonFile(entry.fileName))) {
    throw new Error("ZIP باید فقط شامل فایل‌های JSON باشد");
  }

  const assets = await prisma.chapterAsset.findMany({ where: { chapterId } });
  const assetByBase = new Map(assets.map((asset) => [getBaseName(asset.fileName), asset]));
  const errors: string[] = [];

  for (const entry of entries) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(entry.buffer.toString("utf-8")) as Record<string, unknown>;
    } catch {
      errors.push(`فایل ${entry.fileName} JSON معتبر نیست`);
      continue;
    }

    const explicitImage =
      typeof data.image === "string" && data.image.trim().length
        ? data.image.trim()
        : null;
    const baseName = getBaseName(explicitImage ?? entry.fileName);
    const asset = assetByBase.get(baseName);
    if (!asset) {
      errors.push(`تصویر متناظر برای ${entry.fileName} پیدا نشد`);
      continue;
    }

    const filePath = await saveJsonToStorage(chapterId, entry.fileName, entry.buffer);
    const existing = await prisma.chapterPageJson.findUnique({ where: { assetId: asset.id } });
    if (existing) {
      await deleteStorageFile(existing.jsonPath);
      await prisma.chapterPageJson.update({
        where: { id: existing.id },
        data: {
          jsonPath: filePath,
          jsonFileName: entry.fileName,
          size: entry.buffer.length,
        },
      });
    } else {
      await prisma.chapterPageJson.create({
        data: {
          chapterId,
          assetId: asset.id,
          jsonPath: filePath,
          jsonFileName: entry.fileName,
          size: entry.buffer.length,
        },
      });
    }
  }

  if (errors.length) {
    throw new Error(errors.join(" | "));
  }
}

export default async function ChapterAssetsPage({
  params,
}: {
  params: { id: string };
}) {
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
  if (
    !permissions.has(PERMISSIONS.CHAPTER_ASSETS_VIEW) ||
    !permissions.has(PERMISSIONS.CHAPTER_ASSETS_PAGE_VIEW)
  ) {
    redirect(`/chapters/${params.id}`);
  }

  const canEdit = await canEditChapter(user, chapter);
  const canUpload = permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPLOAD) && canEdit;
  const canUpdate = permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPDATE) && canEdit;
  const canDelete = permissions.has(PERMISSIONS.CHAPTER_ASSETS_DELETE) && canEdit;
  const canBulk = permissions.has(PERMISSIONS.CHAPTER_ASSETS_UPLOAD_MULTI_CHAPTER);

  const assets = await prisma.chapterAsset.findMany({
    where: { chapterId: params.id },
    include: { pageJson: true },
    orderBy: { pageIndex: "asc" },
  });

  async function deleteAsset(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_DELETE,
      "edit",
    );

    const assetId = String(formData.get("assetId") ?? "");
    await deleteAssetWithFiles(assetId);
    revalidatePath(`/chapters/${params.id}/assets`);
    redirect(`/chapters/${params.id}/assets`);
  }

  async function deleteAssets(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_DELETE,
      "edit",
    );

    const assetIds = formData.getAll("assetIds").map((value) => String(value));
    if (assetIds.length === 0) {
      return;
    }
    await Promise.all(assetIds.map((assetId) => deleteAssetWithFiles(assetId)));
    revalidatePath(`/chapters/${params.id}/assets`);
    redirect(`/chapters/${params.id}/assets`);
  }

  async function deleteJson(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_DELETE,
      "edit",
    );

    const jsonId = String(formData.get("jsonId") ?? "");
    await deleteJsonWithFile(jsonId);
    revalidatePath(`/chapters/${params.id}/assets`);
    redirect(`/chapters/${params.id}/assets`);
  }

  async function replaceImage(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_UPDATE,
      "edit",
    );

    const file = formData.get("image") as File | null;
    const assetId = String(formData.get("assetId") ?? "");
    if (!file) {
      throw new Error("تصویر انتخاب نشده است");
    }
    assertFileSize(file, MAX_SINGLE_FILE_MB, "تصویر");

    const asset = await prisma.chapterAsset.findUnique({ where: { id: assetId } });
    if (!asset) {
      throw new Error("تصویر یافت نشد");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = await detectImageMime(buffer);
    if (!mime || !isImageFile(file.name)) {
      throw new Error("فایل تصویر معتبر نیست");
    }

    const fileName = path.basename(file.name);
    const filePath = await saveImageToStorage(params.id, fileName, buffer);
    await deleteStorageFile(asset.filePath);
    await prisma.chapterAsset.update({
      where: { id: asset.id },
      data: {
        filePath,
        fileName,
        mimeType: mime,
        size: buffer.length,
      },
    });
    revalidatePath(`/chapters/${params.id}/assets`);
    redirect(`/chapters/${params.id}/assets`);
  }

  async function replaceJson(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_UPDATE,
      "edit",
    );

    const file = formData.get("json") as File | null;
    const assetId = String(formData.get("assetId") ?? "");
    if (!file) {
      throw new Error("فایل JSON انتخاب نشده است");
    }
    assertFileSize(file, MAX_SINGLE_FILE_MB, "فایل JSON");

    const asset = await prisma.chapterAsset.findUnique({ where: { id: assetId } });
    if (!asset) {
      throw new Error("تصویر یافت نشد");
    }

    if (!isJsonFile(file.name)) {
      throw new Error("فایل JSON معتبر نیست");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = await saveJsonToStorage(params.id, path.basename(file.name), buffer);
    const existing = await prisma.chapterPageJson.findUnique({ where: { assetId: asset.id } });
    if (existing) {
      await deleteStorageFile(existing.jsonPath);
      await prisma.chapterPageJson.update({
        where: { id: existing.id },
        data: { jsonPath: filePath, jsonFileName: file.name, size: buffer.length },
      });
    } else {
      await prisma.chapterPageJson.create({
        data: {
          chapterId: params.id,
          assetId: asset.id,
          jsonPath: filePath,
          jsonFileName: file.name,
          size: buffer.length,
        },
      });
    }

    revalidatePath(`/chapters/${params.id}/assets`);
    redirect(`/chapters/${params.id}/assets`);
  }

  async function reorderPage(formData: FormData) {
    "use server";
    const sessionUser = await getSessionUser();
    if (!sessionUser) return;

    await assertAssetPermission(
      sessionUser.id,
      params.id,
      PERMISSIONS.CHAPTER_ASSETS_UPDATE,
      "edit",
    );

    const assetId = String(formData.get("assetId") ?? "");
    const direction = String(formData.get("direction") ?? "up");
    const asset = await prisma.chapterAsset.findUnique({ where: { id: assetId } });
    if (!asset) return;

    const swapIndex = direction === "up" ? asset.pageIndex - 1 : asset.pageIndex + 1;
    const swapAsset = await prisma.chapterAsset.findFirst({
      where: { chapterId: params.id, pageIndex: swapIndex },
    });
    if (!swapAsset) return;

    await prisma.$transaction([
      prisma.chapterAsset.update({
        where: { id: asset.id },
        data: { pageIndex: 0 },
      }),
      prisma.chapterAsset.update({
        where: { id: swapAsset.id },
        data: { pageIndex: asset.pageIndex },
      }),
      prisma.chapterAsset.update({
        where: { id: asset.id },
        data: { pageIndex: swapIndex },
      }),
    ]);

    revalidatePath(`/chapters/${params.id}/assets`);
    redirect(`/chapters/${params.id}/assets`);
  }

  async function bulkUpload(_: BulkState, formData: FormData): Promise<BulkState> {
    "use server";
    try {
      const sessionUser = await getSessionUser();
      if (!sessionUser) {
        return { status: "error", message: "ابتدا وارد شوید", report: [] };
      }

      await assertAssetPermission(
        sessionUser.id,
        params.id,
        PERMISSIONS.CHAPTER_ASSETS_UPLOAD_MULTI_CHAPTER,
        "edit",
      );

      const file = formData.get("zip") as File | null;
      if (!file) {
        return { status: "error", message: "فایل ZIP انتخاب نشده است", report: [] };
      }
      assertFileSize(file, MAX_ZIP_FILE_MB, "فایل ZIP");
      const mode = String(formData.get("mode") || "append") as ImageMode;

      const entries = await parseZipEntries(file);
      const grouped = new Map<string, { images: typeof entries; jsons: typeof entries }>();
      const errors: string[] = [];

      const bookCache = new Map<string, string | null>();

      for (const entry of entries) {
        const segments = entry.entryPath.split("/").filter(Boolean);
        if (segments.length < 3) {
          errors.push(`مسیر نامعتبر: ${entry.entryPath}`);
          continue;
        }

        let chapterId: string | null = null;
        let typeSegment: string | null = null;

        if (segments[0] === "chapters") {
          chapterId = segments[1];
          typeSegment = segments[2];
        } else {
          const bookKey = segments[0];
          const chapterNumber = segments[1];
          typeSegment = segments[2];

          let bookId = bookCache.get(bookKey) ?? null;
          if (!bookCache.has(bookKey)) {
            const book = await prisma.book.findFirst({
              where: {
                OR: [{ id: bookKey }, { titleFa: bookKey }, { titleEn: bookKey }],
              },
            });
            bookId = book?.id ?? null;
            bookCache.set(bookKey, bookId);
          }
          if (bookId) {
            const chapter = await prisma.chapter.findFirst({
              where: { bookId, number: chapterNumber },
            });
            chapterId = chapter?.id ?? null;
          }
        }

        if (!chapterId) {
          errors.push(`چپتر برای مسیر ${entry.entryPath} پیدا نشد`);
          continue;
        }

        if (!typeSegment) {
          errors.push(`ساختار پوشه برای ${entry.entryPath} نامعتبر است`);
          continue;
        }

        const group = grouped.get(chapterId) ?? { images: [], jsons: [] };
        if (typeSegment.startsWith("image")) {
          group.images.push(entry);
        } else if (typeSegment.startsWith("json")) {
          group.jsons.push(entry);
        } else {
          errors.push(`مسیر ${entry.entryPath} باید داخل پوشه images یا json باشد`);
        }
        grouped.set(chapterId, group);
      }

      const report: { chapterId: string; images: number; jsons: number; error?: string }[] = [];

      for (const [chapterId, group] of grouped.entries()) {
        try {
          await assertAssetPermission(
            sessionUser.id,
            chapterId,
            PERMISSIONS.CHAPTER_ASSETS_UPLOAD_MULTI_CHAPTER,
            "edit",
          );
          if (group.images.length) {
            await processImageEntries(chapterId, group.images, mode);
          }
          if (group.jsons.length) {
            await processJsonEntries(chapterId, group.jsons);
          }
          report.push({
            chapterId,
            images: group.images.length,
            jsons: group.jsons.length,
          });
        } catch (error) {
          await logError(error, "bulkUploadChapter");
          report.push({
            chapterId,
            images: group.images.length,
            jsons: group.jsons.length,
            error: (error as Error).message,
          });
        }
      }

      if (errors.length) {
        return { status: "error", message: errors.join(" | "), report };
      }

      await prisma.chapterUploadBatch.create({
        data: { chapterId: params.id, uploadedByUserId: sessionUser.id, type: "bulk_zip" },
      });

      revalidatePath(`/chapters/${params.id}/assets`);
      return { status: "success", message: "آپلود انبوه انجام شد", report };
    } catch (error) {
      await logError(error, "bulkUpload");
      return { status: "error", message: (error as Error).message, report: [] };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">دارایی‌های چپتر</h2>
          <p className="text-sm text-gray-500">
            {chapter.book.titleFa} · چپتر {chapter.number}
          </p>
        </div>
        <a href={`/chapters/${params.id}`} className="text-sm text-blue-600">
          بازگشت به چپتر
        </a>
      </div>

      <div className="card">
        <p className="text-sm font-semibold">صفحات</p>
        {assets.length === 0 ? (
          <p className="mt-3 text-xs text-gray-500">هنوز صفحه‌ای بارگذاری نشده است.</p>
        ) : (
          <ChapterAssetsGrid
            assets={assets}
            canUpdate={canUpdate}
            canDelete={canDelete}
            deleteAsset={deleteAsset}
            deleteAssets={deleteAssets}
            deleteJson={deleteJson}
            replaceImage={replaceImage}
            replaceJson={replaceJson}
            reorderPage={reorderPage}
          />
        )}
      </div>

      {canUpload && (
        <ChapterAssetsUpload
          chapterId={params.id}
          maxSingleMb={MAX_SINGLE_FILE_MB}
          maxZipMb={MAX_ZIP_FILE_MB}
        />
      )}

      {canBulk && (
        <div className="card">
          <h3 className="text-sm font-semibold">آپلود انبوه چند چپتر</h3>
          <p className="mt-2 text-xs text-gray-500">
            ساختار پیشنهادی: <br />
            chapters/&lt;chapterId&gt;/images/*.jpg<br />
            chapters/&lt;chapterId&gt;/json/*.json<br />
            یا <br />
            &lt;bookTitleOrId&gt;/&lt;chapterNumber&gt;/images/*.jpg
          </p>
          <div className="mt-4">
            <BulkUploadForm action={bulkUpload} />
          </div>
        </div>
      )}
    </div>
  );
}
