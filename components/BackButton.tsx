"use client";

import { useRouter } from "next/navigation";

interface BackButtonProps {
  label?: string;
  className?: string;
}

export default function BackButton({ label = "بازگشت", className }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={className ?? "text-sm text-blue-600"}
    >
      {label}
    </button>
  );
}
