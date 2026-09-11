"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/admin/actions/auth";
import SubmitButton from "@/components/admin/SubmitButton";

export default function LoginForm({ configured }: { configured: boolean }) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, null);

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      <h1 className="font-display text-4xl tracking-tight">
        XIVARRI <span className="text-signal">admin</span>
      </h1>

      {configured ? (
        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <label className="block">
            <span className="admin-label">Contrasenya</span>
            <input
              className="admin-input"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
            />
          </label>

          {state?.error && <p className="font-mono text-sm text-signal">{state.error}</p>}

          <SubmitButton className="admin-btn admin-btn-primary" pendingText="Comprovant…">
            Entrar
          </SubmitButton>
        </form>
      ) : (
        <p className="mt-6 font-body text-sm text-ink/70">
          Aquest administrador encara no té les credencials configurades. Cal definir els secrets{" "}
          <code className="font-mono text-xs">ADMIN_PASSWORD</code> i{" "}
          <code className="font-mono text-xs">ADMIN_SESSION_SECRET</code> abans de poder entrar.
        </p>
      )}
    </div>
  );
}
