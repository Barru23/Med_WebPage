"use client";

import { useLinkStatus } from "next/link";

/**
 * A dot that lights up while the link it sits inside is navigating.
 *
 * Every buyer-facing page here is `force-dynamic`, so tapping a department is a
 * full round trip to the server. On a phone, on a slow night, nothing moved
 * between the tap and the new page arriving — so the thumb tapped again. The
 * pressed state (`.press` in globals.css) answers the tap instantly; this
 * answers the wait.
 *
 * Must be rendered inside a <Link>, which is where `useLinkStatus` reads from.
 * It is always in the layout and only changes opacity, because Next's own
 * guidance is that an indicator appearing from nothing shifts the page under
 * the finger that is still on it.
 */
export default function PendingDot({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      data-pending={pending || undefined}
      className={`pending-dot ${className}`}
    />
  );
}
