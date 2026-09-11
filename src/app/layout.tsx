import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  Bodoni_Moda,
  Permanent_Marker,
  Archivo,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

/* Four faces from CLAUDE.md §8, each exposed as a CSS variable that
   globals.css maps onto the Tailwind font-* tokens. */

// Display — the high-contrast Didone of the "XIVARRI" lockup.
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni",
  display: "swap",
});

// Accent — the "FAREM MOLT" hand. Annotation only. Single weight (400).
const permanentMarker = Permanent_Marker({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-permanent-marker",
  display: "swap",
});

// UI + body.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

// Ticket codes and admin tables.
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "XIVARRI",
  description:
    "XIVARRI — 14a promoció de Medicina, Universitat de Girona. Entrades i activitats.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Locale is resolved by middleware and passed through as a request header,
  // so <html lang> is correct for ca/es/en. Defaults to Catalan (§5).
  const locale = (await headers()).get("x-locale") ?? "ca";
  return (
    <html
      lang={locale}
      className={`${bodoni.variable} ${permanentMarker.variable} ${archivo.variable} ${jetBrainsMono.variable}`}
    >
      <body>
        <a
          href="#main-content"
          className="fixed left-2 top-2 z-50 -translate-y-20 bg-bone px-3 py-2 font-mono text-xs focus:translate-y-0"
        >
          Salta al contingut
        </a>
        {children}
      </body>
    </html>
  );
}
