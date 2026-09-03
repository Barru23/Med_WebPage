"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface DepartmentNavItem {
  slug: string;
  name: string;
}

export default function DepartmentNav({
  locale,
  departments,
}: {
  locale: string;
  departments: DepartmentNavItem[];
}) {
  const pathname = usePathname();
  const isHome = pathname === `/${locale}` || pathname === `/${locale}/`;
  const navRef = useRef<HTMLDivElement>(null);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [indicator, setIndicator] = useState({ x: 0, visible: false });
  const activeSlug = departments.find((department) =>
    pathname.startsWith(`/${locale}/d/${department.slug}`),
  )?.slug;
  const selectedSlug = previewSlug ?? activeSlug;

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !selectedSlug) {
      setIndicator((current) => ({ ...current, visible: false }));
      return;
    }
    const update = () => {
      const item = nav.querySelector<HTMLElement>(`[data-department="${CSS.escape(selectedSlug)}"]`);
      if (!item) return;
      setIndicator({
        x: item.offsetLeft + item.offsetWidth / 2 - 5,
        visible: true,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [selectedSlug]);

  if (isHome) return null;

  return (
    <nav aria-label="Departaments" className="overflow-x-auto px-5 pb-2">
      <div
        ref={navRef}
        className="relative mx-auto flex w-max min-w-full items-center justify-center gap-1 pb-3"
        onPointerLeave={() => setPreviewSlug(null)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPreviewSlug(null);
        }}
      >
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-2.5 w-2.5 rounded-full bg-signal transition-[transform,opacity] duration-300 ease-out"
          style={{
            opacity: indicator.visible ? 1 : 0,
            transform: `translateX(${indicator.x}px)`,
          }}
        />
        {departments.map((department) => (
          <Link
            key={department.slug}
            data-department={department.slug}
            href={`/${locale}/d/${department.slug}`}
            onPointerEnter={() => setPreviewSlug(department.slug)}
            onFocus={() => setPreviewSlug(department.slug)}
            aria-current={activeSlug === department.slug ? "page" : undefined}
            className={`relative z-10 rounded-full px-4 py-1.5 font-mono text-[0.68rem] uppercase tracking-widest outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bone ${
              selectedSlug === department.slug ? "text-signal" : "text-ink/65 hover:text-ink"
            }`}
          >
            {department.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}
