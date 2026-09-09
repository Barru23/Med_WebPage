"use client";

import { useActionState } from "react";
import { deleteActivity, type ActionState } from "@/lib/admin/actions/activities";
import SubmitButton from "@/components/admin/SubmitButton";

export default function DeleteActivityForm({
  id,
  orderCount,
}: {
  id: string;
  orderCount: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(deleteActivity, null);

  if (orderCount > 0) {
    return (
      <p className="font-mono text-xs text-ink/70">
        No es pot eliminar: ja té {orderCount} comanda{orderCount === 1 ? "" : "s"}. Fes servir
        l&apos;interruptor <strong>Publicada</strong> per amagar-la en lloc d&apos;eliminar-la.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="admin-btn admin-btn-danger" pendingText="Eliminant…">
        Eliminar activitat
      </SubmitButton>
      {state?.error && <p className="font-mono text-xs text-signal">{state.error}</p>}
    </form>
  );
}
