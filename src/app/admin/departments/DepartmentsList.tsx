"use client";

import { useState, useTransition } from "react";
import DepartmentRow from "./DepartmentRow";
import { reorderDepartments } from "@/lib/admin/actions/departments";
import type { AdminDepartment } from "@/lib/admin/queries";

export default function DepartmentsList({
  initial,
}: {
  initial: AdminDepartment[];
}) {
  const [order, setOrder] = useState(initial);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function moveTo(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setOrder((prev) => {
      const from = prev.findIndex((d) => d.id === draggedId);
      const to = prev.findIndex((d) => d.id === targetId);
      if (from === -1 || to === -1) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      startTransition(() => {
        reorderDepartments(next.map((d) => d.id));
      });
      return next;
    });
  }

  function moveBy(id: string, delta: number) {
    setOrder((previous) => {
      const from = previous.findIndex((department) => department.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= previous.length) return previous;
      const next = previous.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      startTransition(() => reorderDepartments(next.map((department) => department.id)));
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {order.map((dept, index) => (
        <div
          key={dept.id}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => moveTo(dept.id)}
        >
          <DepartmentRow
            department={dept}
            dragHandleProps={{
              draggable: true,
              onDragStart: () => setDraggedId(dept.id),
              onDragEnd: () => setDraggedId(null),
            }}
            onMoveUp={() => moveBy(dept.id, -1)}
            onMoveDown={() => moveBy(dept.id, 1)}
            first={index === 0}
            last={index === order.length - 1}
          />
        </div>
      ))}
    </div>
  );
}
