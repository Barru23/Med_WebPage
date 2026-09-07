"use client";

import { useTransition } from "react";
import { resyncOrder } from "@/lib/admin/actions/relay";

export default function ResyncButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => resyncOrder(orderId))}
      className="admin-btn text-xs"
      title="Torna a enviar la fila al full i el correu al comprador"
    >
      {pending ? "…" : "Reenviar"}
    </button>
  );
}
