"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-md px-5 py-20 text-center">
      <h1 className="font-display text-4xl">Alguna cosa no ha anat bé</h1>
      <p className="mt-3 font-body text-ink/70">Torna-ho a provar. Si persisteix, avisa l&apos;organització.</p>
      <button type="button" onClick={reset} className="admin-btn mt-6">Tornar-ho a provar</button>
    </main>
  );
}
