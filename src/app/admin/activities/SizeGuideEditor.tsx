"use client";

import Image from "next/image";
import { emptySizeGuideRow, type SizeGuideRowDraft } from "@/lib/admin/activityForm";

export default function SizeGuideEditor({
  rows,
  onChange,
  imageUrl,
}: {
  rows: SizeGuideRowDraft[];
  onChange: (rows: SizeGuideRowDraft[]) => void;
  imageUrl?: string | null;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="admin-card grid grid-cols-[1fr_1fr_1fr_auto] gap-2 p-2">
          <label>
            <span className="admin-label">Talla</span>
            <input className="admin-input" value={row.size} onChange={(event) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, size: event.target.value } : item))} placeholder="M" />
          </label>
          <label>
            <span className="admin-label">Amplada (cm)</span>
            <input type="number" min="0" step="0.1" inputMode="decimal" className="admin-input" value={row.width_cm} onChange={(event) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, width_cm: event.target.value } : item))} />
          </label>
          <label>
            <span className="admin-label">Llargada (cm)</span>
            <input type="number" min="0" step="0.1" inputMode="decimal" className="admin-input" value={row.length_cm} onChange={(event) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, length_cm: event.target.value } : item))} />
          </label>
          <button type="button" className="admin-btn admin-btn-danger self-end px-2" onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Treure talla ${row.size || index + 1}`}>×</button>
        </div>
      ))}
      <button type="button" className="admin-btn text-sm" onClick={() => onChange([...rows, emptySizeGuideRow()])}>+ Afegir talla</button>

      <div className="border-t border-sand pt-3">
        {imageUrl && (
          <div className="mb-2 flex items-center gap-3">
            <Image src={imageUrl} alt="Guia de talles actual" width={80} height={80} unoptimized className="h-20 w-20 object-cover" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="remove_size_guide_image" />
              Treure la imatge actual
            </label>
          </div>
        )}
        <label className="block">
          <span className="admin-label">Imatge de referència (opcional)</span>
          <input type="file" name="size_guide_image" accept="image/jpeg,image/png,image/webp" className="text-sm" />
        </label>
      </div>
    </div>
  );
}
