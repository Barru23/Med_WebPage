"use client";

import { useTransition } from "react";
import { markOrderPaid } from "@/lib/admin/actions/orders";

export default function MarkPaidButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => markOrderPaid(orderId))}
      className="admin-btn admin-btn-primary text-xs"
    >
      {pending ? "…" : "Marcar pagat"}
    </button>
  );
}
