import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import {
  LEGAL_NAV,
  LEGAL_PLACEHOLDER_CONTROLLER,
  LEGAL_PLACEHOLDER_EMAIL,
  getLegalDoc,
} from "@/lib/legal";
import { getLegalIdentity } from "@/lib/legalConfig";

// Rendered per request like every other page here. Prerendering this one meant
// building it without a [locale] to pair each [doc] with, which worked in dev
// and 500'd from the prerendered output in production.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}) {
  const { doc } = await params;
  const found = getLegalDoc(doc);
  return { title: found ? `${found.title} · XIVARRI` : "XIVARRI" };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}) {
  const { locale, doc } = await params;
  if (!isLocale(locale)) notFound();
  const found = getLegalDoc(doc);
  if (!found) notFound();
  const identity = await getLegalIdentity();
  const legalText = (value: string) =>
    value
      .replaceAll(
        LEGAL_PLACEHOLDER_CONTROLLER,
        identity.ready ? identity.name : LEGAL_PLACEHOLDER_CONTROLLER,
      )
      .replaceAll(
        LEGAL_PLACEHOLDER_EMAIL,
        identity.ready ? identity.email : LEGAL_PLACEHOLDER_EMAIL,
      );

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 border-b border-sand pb-4 font-mono text-[0.65rem] uppercase tracking-widest">
        {LEGAL_NAV.map((item) => (
          <Link
            key={item.slug}
            href={`/${locale}/legal/${item.slug}`}
            aria-current={item.slug === found.slug ? "page" : undefined}
            className={
              item.slug === found.slug
                ? "text-signal"
                : "text-ink/70 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-signal"
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <h1 className="mt-8 font-display text-4xl leading-tight tracking-tight text-ink">
        {found.title}
      </h1>

      {identity.ready && (doc === "avis-legal" || doc === "privacitat") && (
        <dl className="mt-4 border border-sand p-4 font-mono text-xs">
          <div><dt className="inline font-semibold">Responsable: </dt><dd className="inline">{identity.name}</dd></div>
          <div><dt className="inline font-semibold">Contacte: </dt><dd className="inline">{identity.email}</dd></div>
        </dl>
      )}

      {found.intro && (
        <p className="mt-3 font-body text-base leading-relaxed text-ink/70">{found.intro}</p>
      )}

      {found.sections.map((section) => (
        <section key={section.heading} className="mt-9">
          <h2 className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-signal">
            {section.heading}
          </h2>
          <div className="mt-2 flex flex-col gap-3">
            {section.body.map((paragraph, i) => (
              <p key={i} className="font-body text-[0.95rem] leading-relaxed text-ink">
                {legalText(paragraph)}
              </p>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-12 border-t border-sand pt-5 font-mono text-[0.65rem] leading-relaxed text-ink/70">
        Si alguna cosa d&apos;aquesta pàgina no s&apos;entén o us sembla que no quadra, escriviu-nos
        abans de comprar. Preferim explicar-ho que discutir-ho després.
      </p>
    </div>
  );
}
