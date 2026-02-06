"use client";

import { useFormStatus } from "react-dom";

type ChapterActionButtonProps = {
  label: string;
  pendingLabel?: string;
  className?: string;
};

export default function ChapterActionButton({
  label,
  pendingLabel = "در حال انجام...",
  className = "",
}: ChapterActionButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`${className} disabled:opacity-60`}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
