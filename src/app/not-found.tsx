import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-5 py-20 text-center">
      <h1 className="font-display text-4xl">Aquí no hi ha res</h1>
      <p className="mt-3 font-body text-ink/70">La pàgina no existeix o ja no està publicada.</p>
      <Link href="/ca" className="admin-btn mt-6 inline-block">Tornar a l&apos;inici</Link>
    </main>
  );
}
