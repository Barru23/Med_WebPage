"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  className = "admin-btn admin-btn-primary",
  pendingText,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (pendingText ?? "…") : children}
    </button>
  );
}
