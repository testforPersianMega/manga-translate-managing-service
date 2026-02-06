import Link from "next/link";

interface SidebarProps {
  permissions: Set<string>;
}

const navItems = [
  { href: "/dashboard", label: "داشبورد", permission: null },
  { href: "/profile", label: "پروفایل", permission: null },
  { href: "/users", label: "کاربران", permission: "USER_LIST" },
  { href: "/roles", label: "نقش‌ها", permission: "ROLE_LIST" },
  { href: "/permissions", label: "کاتالوگ دسترسی‌ها", permission: "ROLE_VIEW" },
  { href: "/books", label: "کتاب‌ها", permission: "BOOK_LIST" },
];

export function Sidebar({ permissions }: SidebarProps) {
  return (
    <aside className="flex w-full flex-col gap-2 bg-white p-4 shadow-sm md:h-screen md:w-64">
      <div className="mb-4">
        <p className="text-lg font-semibold">پنل مدیریت ترجمه</p>
        <p className="text-xs text-gray-500">داخلی · خصوصی</p>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems
          .filter((item) => !item.permission || permissions.has(item.permission))
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {item.label}
            </Link>
          ))}
      </nav>
    </aside>
  );
}
