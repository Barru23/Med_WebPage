"use server";

import { redirect } from "next/navigation";
import { passwordMatches, startSession, endSession } from "@/lib/auth";

export type LoginState = { error?: string } | null;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Escriu la contrasenya." };

  if (!(await passwordMatches(password))) {
    // Deliberately vague: never say whether a password is configured at all.
    return { error: "Contrasenya incorrecta." };
  }
  if (!(await startSession())) {
    return { error: "L'accés no està configurat. Avisa qui gestiona el web." };
  }
  redirect("/admin/activities");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin");
}
