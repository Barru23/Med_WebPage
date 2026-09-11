"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { slugify } from "@/lib/slug";
import { deleteMedia, saveMedia, validateImageFile } from "@/lib/storage";

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
  let photoUrl: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    try {
      await validateImageFile(photo);
      photoUrl = await saveMedia("departments", photo);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "La imatge no és vàlida." };
    }
  }

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
  const current = await db
    .prepare(`SELECT photo_url FROM department WHERE id = ?`)
    .bind(id)
    .first<{ photo_url: string | null }>();
  if (!current) return { error: "El departament no existeix." };

  if (photo instanceof File && photo.size > 0) {
    let photoUrl: string;
    try {
      await validateImageFile(photo);
      photoUrl = await saveMedia("departments", photo);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "La imatge no és vàlida." };
    }
    await db
      .prepare(
        `UPDATE department SET name_ca = ?, name_es = ?, name_en = ?, photo_url = ? WHERE id = ?`,
      )
      .bind(nameCa, str(formData.get("name_es")), str(formData.get("name_en")), photoUrl, id)
      .run();
    await deleteMedia(current.photo_url);
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
  const { results } = await db.prepare(`SELECT id FROM department`).all<{ id: string }>();
  const known = new Set(results.map((row) => row.id));
  if (
    orderedIds.length !== known.size ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((id) => !known.has(id))
  ) {
    throw new Error("L'ordre de departaments no és vàlid.");
  }
  await db.batch(
    orderedIds.map((id, position) =>
      db.prepare(`UPDATE department SET position = ? WHERE id = ?`).bind(position, id),
    ),
  );
  revalidatePath("/admin/departments");
  revalidatePath("/[locale]", "page");
}

export async function deleteDepartment(id: string): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  const department = await db
    .prepare(
      `SELECT d.photo_url,
              (SELECT COUNT(*) FROM activity a WHERE a.department_id = d.id) AS activities
         FROM department d WHERE d.id = ?`,
    )
    .bind(id)
    .first<{ photo_url: string | null; activities: number }>();
  if (!department) return;
  if (department.activities > 0) {
    throw new Error("Només es poden eliminar departaments buits.");
  }
  await db.prepare(`DELETE FROM department WHERE id = ?`).bind(id).run();
  await deleteMedia(department.photo_url);
  revalidatePath("/admin/departments");
  revalidatePath("/[locale]", "page");
}
