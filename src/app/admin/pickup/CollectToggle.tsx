"use client";

import { useTransition } from "react";
import { markCollected, undoCollected } from "@/lib/admin/actions/pickup";

export default function CollectToggle({
  orderItemId,
  collected,
}: {
  orderItemId: string;
  collected: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (collected && !window.confirm("Vols desfer la recollida?")) return;
        startTransition(() =>
          collected ? undoCollected(orderItemId) : markCollected(orderItemId),
        );
      }}
      className={collected ? "admin-btn admin-btn-primary text-xs" : "admin-btn text-xs"}
    >
      {collected ? "✓ Recollit" : "Marcar recollit"}
    </button>
  );
}
