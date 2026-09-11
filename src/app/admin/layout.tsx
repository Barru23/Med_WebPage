import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { logout } from "@/lib/admin/actions/auth";

const NAV = [
  { href: "/admin/departments", label: "Departaments" },
  { href: "/admin/activities", label: "Activitats" },
  { href: "/admin/door", label: "Porta" },
  { href: "/admin/pickup", label: "Recollida" },
  { href: "/admin/operations", label: "Operacions" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // src/proxy.ts already turned unauthenticated admin requests into the login
  // screen, so this should be unreachable. It stays as a second lock: if the
  // proxy is ever misconfigured, the panel fails closed rather than open.
  if (!(await isAdmin())) redirect("/entrar");

  return (
    <div className="flex min-h-dvh flex-col bg-bone text-ink">
      <header className="sticky top-0 z-20 border-b border-sand bg-bone">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/admin/departments" className="font-display text-xl tracking-tight">
            XIVARRI <span className="text-signal">admin</span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="font-mono text-[0.65rem] uppercase tracking-widest text-ink/70 underline underline-offset-4 outline-none hover:text-signal focus-visible:ring-2 focus-visible:ring-signal"
            >
              Sortir
            </button>
          </form>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 font-mono text-xs uppercase tracking-widest">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap border border-sand px-3 py-1.5 text-ink/70 outline-none hover:border-ink hover:text-ink focus-visible:ring-2 focus-visible:ring-signal"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main-content" className="flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
