"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh a pending receipt while Stripe's webhook catches up. */
export default function PendingRefresh() {
  const router = useRouter();

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt >= 60_000) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}
