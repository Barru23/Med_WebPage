/**
 * The signature device (CLAUDE.md §8): a single enormous Bodoni word sliced
 * across three panels with visible hairline seams, the panels nudged a few
 * pixels vertically so the seam reads as a deliberate cut. The offset is
 * static (not scroll-driven) to stay calm and respect reduced-motion.
 */
export default function SeamWord({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  const offsets = [-4, 5, -2]; // px, per panel
  return (
    <div
      role="img"
      aria-label={children}
      className={`relative select-none font-display leading-[0.8] ${className}`}
    >
      {/* Three clipped copies of the word, each nudged vertically. */}
      {offsets.map((dy, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute inset-0"
          style={{
            clipPath: `inset(0 ${(2 - i) * 33.3334}% 0 ${i * 33.3334}%)`,
            transform: `translateY(${dy}px)`,
          }}
        >
          {children}
        </span>
      ))}
      {/* Hairline seams over the cuts. */}
      <div className="seam-rules" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      {/* Invisible copy sizes the box. */}
      <span className="invisible">{children}</span>
    </div>
  );
}
