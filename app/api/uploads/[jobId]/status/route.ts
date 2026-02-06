import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canEditChapter } from "@/lib/authorization";

const STALE_JOB_MINUTES = 10;

function getPercent(progressCurrent: number | null, progressTotal: number | null) {
  if (progressCurrent === null || progressTotal === null || progressTotal === 0) return null;
  return Math.max(0, Math.min(100, Math.round((progressCurrent / progressTotal) * 100)));
}

interface RouteParams {
  params: { jobId: string };
}

export async function GET(_: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const job = await prisma.uploadJob.findUnique({
    where: { id: params.jobId },
    include: { chapter: true },
  });
  if (!job) {
    return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  }

  const isAdmin = user.role?.name === "ADMIN";
  if (!isAdmin) {
    if (job.userId !== user.id) {
      return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
    }
    const canEdit = await canEditChapter(user, job.chapter);
    if (!canEdit) {
      return NextResponse.json({ error: "عدم دسترسی" }, { status: 403 });
    }
  }

  if (
    job.status !== "DONE" &&
    job.status !== "ERROR" &&
    Date.now() - job.updatedAt.getTime() > STALE_JOB_MINUTES * 60 * 1000
  ) {
    await prisma.uploadJob.update({
      where: { id: job.id },
      data: {
        status: "ERROR",
        messageFa: "پردازش به دلیل وقفه سرور متوقف شد",
      },
    });
  }

  const refreshed = await prisma.uploadJob.findUnique({ where: { id: job.id } });
  if (!refreshed) {
    return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  }

  return NextResponse.json({
    status: refreshed.status,
    percent: getPercent(refreshed.progressCurrent, refreshed.progressTotal),
    messageFa: refreshed.messageFa,
    isDone: refreshed.status === "DONE",
    isError: refreshed.status === "ERROR",
  });
}
