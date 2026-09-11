"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { ActivityImageDraft } from "@/lib/admin/activityForm";

export default function MediaEditor({
  images,
  onChange,
}: {
  images: ActivityImageDraft[];
  onChange: (images: ActivityImageDraft[]) => void;
}) {
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {images.map((image, index) => (
        <div key={image.id} className="admin-card flex items-center gap-3 p-2">
          <Image
            src={image.image_url}
            alt=""
            width={72}
            height={72}
            unoptimized
            className="h-16 w-16 shrink-0 object-cover"
          />
          <label className="min-w-0 flex-1">
            <span className="admin-label">Text alternatiu (CA)</span>
            <input
              className="admin-input"
              value={image.alt_ca}
              onChange={(event) =>
                onChange(
                  images.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, alt_ca: event.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <div className="flex shrink-0 flex-col gap-1">
            <button type="button" className="admin-btn px-2 py-1" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Moure imatge amunt">↑</button>
            <button type="button" className="admin-btn px-2 py-1" onClick={() => move(index, 1)} disabled={index === images.length - 1} aria-label="Moure imatge avall">↓</button>
            <button type="button" className="admin-btn admin-btn-danger px-2 py-1" onClick={() => onChange(images.filter((_, itemIndex) => itemIndex !== index))}>Treure</button>
          </div>
        </div>
      ))}

      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Imatges noves seleccionades">
          {previews.map((src) => (
            // Blob URLs are local previews and deliberately bypass Next image optimisation.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="Previsualització" className="h-16 w-16 border border-sand object-cover" />
          ))}
        </div>
      )}

      <label className="block">
        <span className="admin-label">Afegir fotos</span>
        <input
          type="file"
          name="gallery"
        accept="image/jpeg,image/png,image/webp"
          multiple
          className="text-sm"
          onChange={(event) => {
            previews.forEach(URL.revokeObjectURL);
            setPreviews(Array.from(event.target.files ?? []).map(URL.createObjectURL));
          }}
        />
      </label>
    </div>
  );
}
