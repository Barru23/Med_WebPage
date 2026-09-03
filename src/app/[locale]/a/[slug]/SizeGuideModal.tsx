"use client";

import Image from "next/image";
import { useRef } from "react";
import type { SizeGuideRow } from "@/lib/queries";

export default function SizeGuideModal({
  rows,
  imageUrl,
  strings,
}: {
  rows: SizeGuideRow[];
  imageUrl: string | null;
  strings: { title: string; size: string; width: string; length: string; close: string; note: string };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="font-mono text-xs uppercase tracking-widest text-signal underline decoration-sand underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-signal"
        onClick={() => dialogRef.current?.showModal()}
      >
        {strings.title}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="size-guide-title"
        className="m-auto w-[calc(100%-2rem)] max-w-lg border border-ink bg-bone p-0 text-ink backdrop:bg-ink/60"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 id="size-guide-title" className="font-display text-3xl">{strings.title}</h2>
            <button type="button" className="font-mono text-xs uppercase tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-signal" onClick={() => dialogRef.current?.close()}>{strings.close}</button>
          </div>
          <p className="mt-2 text-sm text-ink/65">{strings.note}</p>
          {rows.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse font-mono text-sm">
                <thead>
                  <tr className="border-b-2 border-ink text-left">
                    <th className="py-2 pr-3">{strings.size}</th>
                    <th className="px-3 py-2">{strings.width}</th>
                    <th className="py-2 pl-3">{strings.length}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.size} className="border-b border-sand">
                      <th className="py-2 pr-3 text-left">{row.size}</th>
                      <td className="px-3 py-2">{row.width_cm} cm</td>
                      <td className="py-2 pl-3">{row.length_cm} cm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {imageUrl && (
            <Image src={imageUrl} alt={strings.title} width={700} height={700} unoptimized className="mt-5 h-auto w-full border border-sand object-contain" />
          )}
        </div>
      </dialog>
    </>
  );
}
