import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/authorization";
import { PERMISSIONS } from "@/lib/permissions";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const permissions = await getEffectivePermissions(user.id);

  const [userCount, bookCount, chapterCounts] = await Promise.all([
    prisma.user.count(),
    prisma.book.count(),
    prisma.chapter.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);

  const statusMap = new Map(
    chapterCounts.map((item) => [item.status, item._count]),
  );

  const showAdmin = permissions.has(PERMISSIONS.DASHBOARD_ADMIN);
  const showManager = permissions.has(PERMISSIONS.DASHBOARD_MANAGER);
  const showTranslator = permissions.has(PERMISSIONS.DASHBOARD_TRANSLATOR);

  const myChapters = await prisma.chapter.findMany({
    where: { assignedToUserId: user.id },
    include: { book: true },
  });

  const availableChapters = permissions.has(PERMISSIONS.CHAPTER_CLAIM)
    ? await prisma.chapter.findMany({
        where: { status: "AVAILABLE" },
        include: { book: true },
        take: 5,
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <p className="text-sm text-gray-500">تعداد کاربران</p>
          <p className="mt-2 text-2xl font-semibold">{userCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">تعداد کتاب‌ها</p>
          <p className="mt-2 text-2xl font-semibold">{bookCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">چپترهای انجام‌شده</p>
          <p className="mt-2 text-2xl font-semibold">
            {statusMap.get("DONE") ?? 0}
          </p>
        </div>
      </div>

      {(showAdmin || showManager) && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <p className="text-sm text-gray-500">وضعیت چپترها</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>آزاد: {statusMap.get("AVAILABLE") ?? 0}</li>
              <li>برداشته‌شده: {statusMap.get("CLAIMED") ?? 0}</li>
              <li>در حال انجام: {statusMap.get("IN_PROGRESS") ?? 0}</li>
              <li>انجام‌شده: {statusMap.get("DONE") ?? 0}</li>
            </ul>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">لینک‌های سریع</p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <a className="rounded-md bg-gray-900 px-3 py-2 text-white" href="/users">
                کاربران
              </a>
              <a className="rounded-md bg-gray-900 px-3 py-2 text-white" href="/roles">
                نقش‌ها
              </a>
              <a className="rounded-md bg-gray-900 px-3 py-2 text-white" href="/books">
                کتاب‌ها
              </a>
            </div>
          </div>
        </div>
      )}

      {showTranslator && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <p className="text-sm font-semibold">چپترهای من</p>
            <ul className="mt-4 space-y-2 text-sm">
              {myChapters.length === 0 && <li>چپتری برای شما ثبت نشده است.</li>}
              {myChapters.map((chapter) => (
                <li key={chapter.id}>
                  {chapter.book.titleFa} · چپتر {chapter.number}
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <p className="text-sm font-semibold">چپترهای آزاد برای برداشتن</p>
            <ul className="mt-4 space-y-2 text-sm">
              {availableChapters.length === 0 && <li>موردی یافت نشد.</li>}
              {availableChapters.map((chapter) => (
                <li key={chapter.id}>
                  {chapter.book.titleFa} · چپتر {chapter.number}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!showAdmin && !showManager && !showTranslator && (
        <div className="card">
          <p className="text-sm text-gray-600">
            برای مشاهده داشبورد باید دسترسی مناسب داشته باشید.
          </p>
        </div>
      )}
    </div>
  );
}
