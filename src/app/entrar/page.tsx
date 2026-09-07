import { isConfigured } from "@/lib/auth";
import LoginForm from "@/app/admin/LoginForm";

export const dynamic = "force-dynamic";

/**
 * The admin login screen. It lives outside /admin on purpose: src/proxy.ts
 * rewrites unauthenticated admin requests here, so nothing under /admin ever
 * runs for a visitor without a session.
 */
export default async function LoginPage() {
  return (
    <div className="bg-bone text-ink">
      <LoginForm configured={await isConfigured()} />
    </div>
  );
}
