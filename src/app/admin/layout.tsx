import Link from "next/link";
import { getAccessEmail } from "@/lib/access";

const NAV = [
  { href: "/admin/departments", label: "Departaments" },
  { href: "/admin/activities", label: "Activitats" },
  { href: "/admin/door", label: "Porta" },
  { href: "/admin/pickup", label: "Recollida" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const email = await getAccessEmail();

  return (
    <div className="flex min-h-dvh flex-col bg-bone text-ink">
      <header className="sticky top-0 z-20 border-b border-sand bg-bone">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/admin/departments" className="font-display text-xl tracking-tight">
            XIVARRI <span className="text-signal">admin</span>
          </Link>
          <span className="font-mono text-[0.65rem] text-ink/50">
            {email ?? "accés local (sense Cloudflare Access)"}
          </span>
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
      <main className="flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
