"use client";

import { useTransition } from "react";
import { resyncOrder } from "@/lib/admin/actions/relay";
import type { RelayChannel } from "@/lib/relay";

function ChannelButton({
  orderId,
  channel,
  label,
  uncertain = false,
}: {
  orderId: string;
  channel: RelayChannel;
  label: string;
  uncertain?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          uncertain &&
          !window.confirm("No sabem si aquest correu antic es va enviar. Vols enviar-lo ara?")
        ) {
          return;
        }
        startTransition(() => resyncOrder(orderId, channel));
      }}
      className="admin-btn text-xs"
    >
      {pending ? "…" : label}
    </button>
  );
}

export default function ResyncButton({
  orderId,
  sheetStatus,
  emailStatus,
}: {
  orderId: string;
  sheetStatus: string;
  emailStatus: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {sheetStatus !== "sent" && (
        <ChannelButton orderId={orderId} channel="sheet" label="Reintentar full" />
      )}
      {emailStatus !== "sent" && (
        <ChannelButton
          orderId={orderId}
          channel="email"
          label="Enviar correu"
          uncertain={emailStatus === "unknown"}
        />
      )}
    </div>
  );
}
