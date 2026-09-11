import { utcToWallTime } from "@/lib/time";

// Shared shape for the variant/field editors in ActivityForm (client) and
// the createActivity/updateActivity server actions. Serialized to JSON in
// hidden form fields rather than name="variants[0].x" indexing.

export interface VariantDraft {
  id?: string; // present = existing row (UPDATE), absent = new row (INSERT)
  name_ca: string;
  name_es: string;
  name_en: string;
  price_euros: string; // "12,50" / "12.50" as typed; parsed server-side
  stock: string;
  sold: number; // read-only, for the client to guard row removal
  sale_start: string; // datetime-local value, "" if unset
  sale_end: string;
}

export interface FieldDraft {
  id?: string;
  label_ca: string;
  label_es: string;
  label_en: string;
  type: "text" | "number" | "select" | "checkbox";
  options: string; // newline-separated plain labels, only used for select/checkbox
  options_es: string;
  options_en: string;
  required: boolean;
  data_classification: "standard" | "identity" | "health";
}

export interface ActivityImageDraft {
  id: string;
  image_url: string;
  alt_ca: string;
}

export interface SizeGuideRowDraft {
  size: string;
  width_cm: string;
  length_cm: string;
}

export function emptySizeGuideRow(): SizeGuideRowDraft {
  return { size: "", width_cm: "", length_cm: "" };
}

export function emptyVariant(): VariantDraft {
  return {
    name_ca: "",
    name_es: "",
    name_en: "",
    price_euros: "",
    stock: "",
    sold: 0,
    sale_start: "",
    sale_end: "",
  };
}

export function emptyField(): FieldDraft {
  return {
    label_ca: "",
    label_es: "",
    label_en: "",
    type: "text",
    options: "",
    options_es: "",
    options_en: "",
    required: false,
    data_classification: "standard",
  };
}

export function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Stored UTC "YYYY-MM-DD HH:MM:SS" -> <input type="datetime-local"> value,
 *  converted back to the Girona clock the admin typed it on. */
export function toInputDatetime(v: string | null): string {
  return utcToWallTime(v);
}
