"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function ProfileLogoutButton() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoading}
      className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      {isLoading ? "در حال خروج..." : "خروج از حساب"}
    </button>
  );
}
