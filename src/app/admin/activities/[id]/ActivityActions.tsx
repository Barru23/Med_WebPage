"use client";

import { useTransition } from "react";
import { duplicateActivity, setActivityArchived } from "@/lib/admin/actions/activities";

export default function ActivityActions({
  id,
  archived,
}: {
  id: string;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !archived &&
            !window.confirm("Arxivar l'activitat i tancar les compres obertes?")
          ) return;
          startTransition(() => setActivityArchived(id, !archived));
        }}
        className={archived ? "admin-btn text-sm" : "admin-btn admin-btn-danger text-sm"}
      >
        {archived ? "Restaurar" : "Arxivar"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => duplicateActivity(id))}
        className="admin-btn text-sm"
      >
        Duplicar
      </button>
    </div>
  );
}
