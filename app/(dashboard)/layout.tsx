import { getEffectivePermissions } from "@/lib/authorization";
import { getSessionUser } from "@/lib/auth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { redirect } from "next/navigation";

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  const permissions = await getEffectivePermissions(user.id);
  return (
    <DashboardLayout
      permissions={permissions}
      userName={user.name ?? user.email}
    >
      {children}
    </DashboardLayout>
  );
}
