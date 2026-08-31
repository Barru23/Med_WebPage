"use client";

import { useActionState } from "react";
import Image from "next/image";
import {
  updateDepartment,
  type ActionState,
} from "@/lib/admin/actions/departments";
import SubmitButton from "@/components/admin/SubmitButton";
import type { AdminDepartment } from "@/lib/admin/queries";

export default function DepartmentRow({
  department,
  dragHandleProps,
}: {
  department: AdminDepartment;
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateDepartment,
    null,
  );

  return (
    <form
      action={formAction}
      className="admin-card flex flex-col gap-3 p-4 sm:flex-row sm:items-start"
    >
      <input type="hidden" name="id" value={department.id} />

      <button
        type="button"
        aria-label="Arrossega per reordenar"
        className="cursor-grab self-start rounded border border-sand px-2 py-1 font-mono text-xs text-ink/50 active:cursor-grabbing"
        {...dragHandleProps}
      >
        ⠿
      </button>

      <div className="flex-none">
        {department.photo_url ? (
          <Image
            src={department.photo_url}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 border border-sand object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center border border-dashed border-sand font-mono text-[0.6rem] text-ink/40">
            sense foto
          </div>
        )}
        <input
          type="file"
          name="photo"
          accept="image/*"
          className="mt-1 block w-16 text-[0.55rem] file:mr-0 file:rounded-none file:border file:border-sand file:bg-bone file:px-1 file:py-0.5 file:text-[0.55rem] file:text-ink"
          title="Canviar foto"
        />
      </div>

      <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="admin-label">Nom (CA) *</span>
          <input
            className="admin-input"
            name="name_ca"
            defaultValue={department.name_ca}
            required
          />
        </label>
        <label className="block">
          <span className="admin-label">Nom (ES)</span>
          <input className="admin-input" name="name_es" defaultValue={department.name_es ?? ""} />
        </label>
        <label className="block">
          <span className="admin-label">Nom (EN)</span>
          <input className="admin-input" name="name_en" defaultValue={department.name_en ?? ""} />
        </label>
      </div>

      <div className="flex flex-none items-start gap-2">
        {state?.error && (
          <p className="font-mono text-xs text-signal">{state.error}</p>
        )}
        <SubmitButton pendingText="Desant…">Desar</SubmitButton>
      </div>
    </form>
  );
}
