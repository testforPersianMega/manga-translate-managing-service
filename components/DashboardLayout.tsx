import { Sidebar } from "./Sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  permissions: Set<string>;
  userName: string;
}

export function DashboardLayout({
  children,
  permissions,
  userName,
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex flex-col md:flex-row">
        <Sidebar permissions={permissions} />
        <main className="flex-1 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">سلام {userName}</h1>
              <p className="text-sm text-gray-500">خوش آمدید به پنل مدیریت</p>
            </div>
          </div>
          <div>{children}</div>
        </main>
      </div>
    </div>
  );
}
