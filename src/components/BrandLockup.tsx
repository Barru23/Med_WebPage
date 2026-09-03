export default function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`relative inline-flex flex-col ${compact ? "pt-2" : "pt-8"}`}>
      <span
        className={`absolute left-0 top-0 z-10 -rotate-6 whitespace-nowrap font-marker text-ink ${
          compact ? "text-[0.55rem]" : "text-[clamp(1rem,4vw,2rem)]"
        }`}
      >
        FAREM MOLT
      </span>
      <span
        className={`font-display font-bold leading-[0.78] tracking-[-0.07em] ${
          compact ? "text-3xl" : "text-[clamp(4rem,22vw,11rem)]"
        }`}
      >
        <span className="text-signal">XIV</span>
        <span className="text-ink">ARRI</span>
      </span>
      <span
        className={`text-center font-display font-semibold leading-none text-ink ${
          compact ? "sr-only" : "mt-3 text-[clamp(0.9rem,4vw,1.8rem)]"
        }`}
      >
        14 promoció de Medicina de la UdG
      </span>
    </span>
  );
}
