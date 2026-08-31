"use client";

import { useActionState, useRef } from "react";
import { createDepartment, type ActionState } from "@/lib/admin/actions/departments";
import SubmitButton from "@/components/admin/SubmitButton";

export default function AddDepartmentForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await createDepartment(prev, formData);
      if (!result) formRef.current?.reset();
      return result;
    },
    null,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="admin-card flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
    >
      <label className="block flex-1">
        <span className="admin-label">Nom (CA) *</span>
        <input className="admin-input" name="name_ca" required />
      </label>
      <label className="block flex-1">
        <span className="admin-label">Nom (ES)</span>
        <input className="admin-input" name="name_es" />
      </label>
      <label className="block flex-1">
        <span className="admin-label">Nom (EN)</span>
        <input className="admin-input" name="name_en" />
      </label>
      <label className="block">
        <span className="admin-label">Foto</span>
        <input type="file" name="photo" accept="image/*" className="text-sm" />
      </label>
      {state?.error && <p className="font-mono text-xs text-signal">{state.error}</p>}
      <SubmitButton pendingText="Afegint…">Afegir departament</SubmitButton>
    </form>
  );
}
