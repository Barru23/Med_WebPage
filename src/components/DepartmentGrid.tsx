"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GreasePencilRing } from "@/components/marks";
import PendingDot from "@/components/Pending";

export interface DepartmentGridItem {
  id: string;
  slug: string;
  name: string;
  openCount: number;
}

export default function DepartmentGrid({
  locale,
  departments,
  noOpenActivities,
}: {
  locale: string;
  departments: DepartmentGridItem[];
  noOpenActivities: string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const defaultId = departments.find((department) => department.openCount > 0)?.id ?? departments[0]?.id;
  const [selectedId, setSelectedId] = useState(defaultId);
  const [ring, setRing] = useState({ x: 0, y: 0, width: 0, height: 0, visible: false });

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !selectedId) return;

    const update = () => {
      const target = grid.querySelector<HTMLElement>(`[data-ring-target="${CSS.escape(selectedId)}"]`);
      if (!target) return;
      const gridRect = grid.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setRing({
        x: targetRect.left - gridRect.left,
        y: targetRect.top - gridRect.top,
        width: targetRect.width,
        height: targetRect.height,
        visible: true,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [selectedId]);

  return (
    <div
      ref={gridRef}
      className="relative grid grid-cols-2 gap-3 sm:grid-cols-3"
      onPointerLeave={() => setSelectedId(defaultId)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setSelectedId(defaultId);
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-10 transition-[transform,width,height,opacity] duration-500 ease-out"
        style={{
          width: ring.width,
          height: ring.height,
          opacity: ring.visible ? 1 : 0,
          transform: `translate(${ring.x}px, ${ring.y}px)`,
        }}
      >
        <GreasePencilRing />
      </span>

      {departments.map((department, index) => {
        const open = department.openCount > 0;
        const frame = String(index + 1).padStart(2, "0");
        return (
          <Link
            key={department.id}
            href={`/${locale}/d/${department.slug}`}
            onPointerEnter={() => setSelectedId(department.id)}
            onFocus={() => setSelectedId(department.id)}
            className={`press group relative flex aspect-[4/5] flex-col border border-sand bg-bone p-2 outline-none focus-visible:ring-2 focus-visible:ring-signal ${
              open ? "hover:shadow-[3px_3px_0_var(--color-sand)]" : "opacity-60"
            }`}
          >
            <span className="font-mono text-[0.65rem] tracking-widest text-ink/40">{frame}</span>
            <span
              data-ring-target={department.id}
              className="relative flex flex-1 items-center justify-center px-1 text-center"
            >
              <span className="font-display text-[clamp(1.5rem,7vw,2.75rem)] leading-none tracking-tight text-ink">
                {department.name}
              </span>
            </span>
            <span className="mt-1 flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-widest">
              <span className="text-ink/60">{department.name}</span>
              <span className="flex items-center gap-1.5">
                <span className={open ? "text-signal" : "text-ink/40"}>
                  {open ? `· ${department.openCount}` : noOpenActivities}
                </span>
                <PendingDot />
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
