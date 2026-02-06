import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canEditChapter } from "@/lib/authorization";

function getPercent(progressCurrent: number | null, progressTotal: number | null) {
  if (progressCurrent === null || progressTotal === null || progressTotal === 0) return null;
  return Math.max(0, Math.min(100, Math.round((progressCurrent / progressTotal) * 100)));
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chapterId = searchParams.get("chapterId");
  if (!chapterId) {
    return NextResponse.json({ error: "شناسه چپتر لازم است" }, { status: 400 });
  }

  const isAdmin = user.role?.name === "ADMIN";
  const job = await prisma.uploadJob.findFirst({
    where: isAdmin ? { chapterId } : { chapterId, userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { chapter: true },
  });

  if (!job) {
    return NextResponse.json({ jobId: null });
  }

  if (!isAdmin) {
    const canEdit = await canEditChapter(user, job.chapter);
    if (!canEdit) {
      return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
    }
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    percent: getPercent(job.progressCurrent, job.progressTotal),
    messageFa: job.messageFa,
    isDone: job.status === "DONE",
    isError: job.status === "ERROR",
  });
}
