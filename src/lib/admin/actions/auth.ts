"use server";

import { redirect } from "next/navigation";
import { passwordMatches, startSession, endSession } from "@/lib/auth";
import {
  clientIp,
  consumeLoginAttempt,
  clearAttempts,
} from "@/lib/loginRate";

export type LoginState = { error?: string } | null;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Escriu la contrasenya." };

  const ip = await clientIp();
  if (await consumeLoginAttempt(ip)) {
    return { error: "Massa intents. Espera un quart d'hora i torna-ho a provar." };
  }

  if (!(await passwordMatches(password))) {
    // Deliberately vague: never say whether a password is configured at all.
    return { error: "Contrasenya incorrecta." };
  }
  if (!(await startSession())) {
    return { error: "L'accés no està configurat. Avisa qui gestiona el web." };
  }
  await clearAttempts(ip);
  redirect("/admin/activities");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin");
}
