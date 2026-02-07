import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canEditChapter, canViewChapter, getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";
import { logError } from "@/lib/error-logger";

interface RouteParams {
  params: { id: string; assetId: string };
}

type HistoryEntryInput = {
  label?: string;
  snapshot?: unknown;
  meta?: unknown;
  metadata?: unknown;
};

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

    const asset = await prisma.chapterAsset.findUnique({ where: { id: params.assetId } });
    if (!asset || asset.chapterId !== chapter.id) {
      return NextResponse.json({ error: "دارایی یافت نشد" }, { status: 404 });
    }

    const historyEntries = await prisma.chapterPageHistory.findMany({
      where: { assetId: asset.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      historyEntries.map((entry) => ({
        id: entry.id,
        label: entry.label,
        snapshot: entry.snapshot,
        meta: entry.metadata,
        timestamp: entry.createdAt.getTime(),
      })),
    );
  } catch (error) {
    await logError(
      error,
      `GET /api/chapters/${params.id}/assets/${params.assetId}/history`,
    );
    return NextResponse.json({ error: "خطای داخلی سرور" }, { status: 500 });
  }
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

    const body = (await request.json()) as { entries?: HistoryEntryInput[]; entry?: HistoryEntryInput };
    const entries = Array.isArray(body?.entries)
      ? body.entries
      : body?.entry
        ? [body.entry]
        : [];

    const data = entries
      .filter((entry) => entry?.label && entry?.snapshot && typeof entry.snapshot === "object")
      .map((entry) => ({
        chapterId: chapter.id,
        assetId: asset.id,
        label: String(entry.label),
        snapshot: entry.snapshot,
        metadata: entry.meta ?? entry.metadata ?? null,
      }));

    if (!data.length) {
      return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    }

    const created = await prisma.chapterPageHistory.createMany({ data });

    return NextResponse.json({ count: created.count });
  } catch (error) {
    await logError(
      error,
      `POST /api/chapters/${params.id}/assets/${params.assetId}/history`,
    );
    return NextResponse.json({ error: "خطای داخلی سرور" }, { status: 500 });
  }
}
