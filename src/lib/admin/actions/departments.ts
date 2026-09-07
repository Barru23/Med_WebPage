"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { slugify } from "@/lib/slug";
import { saveMedia } from "@/lib/storage";

export type ActionState = { error?: string } | null;

function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export async function createDepartment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const nameCa = str(formData.get("name_ca"));
  if (!nameCa) return { error: "El nom en català és obligatori." };

  const db = await getDb();
  const slug = slugify(nameCa);
  const existing = await db
    .prepare(`SELECT 1 FROM department WHERE slug = ?`)
    .bind(slug)
    .first();
  if (existing) return { error: "Ja existeix un departament amb aquest nom." };

  const { results } = await db
    .prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM department`)
    .all<{ next: number }>();
  const position = results[0]?.next ?? 0;

  const photo = formData.get("photo");
  const photoUrl =
    photo instanceof File && photo.size > 0 ? await saveMedia("departments", photo) : null;

  await db
    .prepare(
      `INSERT INTO department (id, slug, position, name_ca, name_es, name_en, photo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId("dept"), slug, position, nameCa, str(formData.get("name_es")), str(formData.get("name_en")), photoUrl)
    .run();

  revalidatePath("/admin/departments");
  return null;
}

export async function updateDepartment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = str(formData.get("id"));
  const nameCa = str(formData.get("name_ca"));
  if (!id || !nameCa) return { error: "El nom en català és obligatori." };

  const db = await getDb();
  const photo = formData.get("photo");

  if (photo instanceof File && photo.size > 0) {
    const photoUrl = await saveMedia("departments", photo);
    await db
      .prepare(
        `UPDATE department SET name_ca = ?, name_es = ?, name_en = ?, photo_url = ? WHERE id = ?`,
      )
      .bind(nameCa, str(formData.get("name_es")), str(formData.get("name_en")), photoUrl, id)
      .run();
  } else {
    await db
      .prepare(`UPDATE department SET name_ca = ?, name_es = ?, name_en = ? WHERE id = ?`)
      .bind(nameCa, str(formData.get("name_es")), str(formData.get("name_en")), id)
      .run();
  }

  revalidatePath("/admin/departments");
  revalidatePath("/[locale]", "page");
  return null;
}

export async function reorderDepartments(orderedIds: string[]): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  await db.batch(
    orderedIds.map((id, position) =>
      db.prepare(`UPDATE department SET position = ? WHERE id = ?`).bind(position, id),
    ),
  );
  revalidatePath("/admin/departments");
  revalidatePath("/[locale]", "page");
}
