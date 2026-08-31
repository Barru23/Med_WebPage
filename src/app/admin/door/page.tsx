import DoorScanner from "./DoorScanner";

export default function DoorPage() {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-display text-3xl tracking-tight">Porta</h1>
      <p className="mt-1 font-mono text-xs text-ink/50">
        Escaneja el QR de l&apos;entrada.
      </p>
      <div className="mt-4">
        <DoorScanner />
      </div>
    </div>
  );
}
