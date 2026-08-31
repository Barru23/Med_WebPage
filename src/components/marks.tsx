/**
 * Hand-annotation marks (CLAUDE.md §8). Used sparingly — at most one
 * Permanent-Marker margin annotation per screen.
 */

/** Red rubber stamp, e.g. a "Mostra" / sold-out mark. */
export function Stamp({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`stamp ${className}`}>{children}</span>;
}

/**
 * A margin annotation in Permanent Marker with a hand-drawn ellipse around it.
 * One per screen — the "farem molt" hand scrawled in the margin.
 */
export function MarkerNote({
  children,
  className = "",
  rotate = -6,
}: {
  children: React.ReactNode;
  className?: string;
  rotate?: number;
}) {
  return (
    <span
      className={`relative inline-block font-marker text-signal ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
      <svg
        aria-hidden
        viewBox="0 0 200 80"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -inset-x-3 -inset-y-2 h-[calc(100%+1rem)] w-[calc(100%+1.5rem)]"
      >
        {/* Rough, non-uniform ellipse — grease-pencil feel. */}
        <path
          d="M99 6 C40 4 8 22 8 40 C8 60 52 76 108 74 C170 72 194 52 192 34 C190 14 150 5 99 6 Z"
          fill="none"
          stroke="var(--color-signal)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/**
 * A grease-pencil ring drawn over a contact-sheet frame to circle what is
 * live right now (template C). Absolutely positioned inside a relative parent.
 */
export function GreasePencilRing({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      <path
        d="M50 8 C22 7 9 26 10 50 C11 76 30 93 52 92 C78 91 92 70 90 47 C88 22 74 9 50 8 Z"
        fill="none"
        stroke="var(--color-signal)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}
