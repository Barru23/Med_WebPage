import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface LegalIdentity {
  name: string;
  email: string;
  ready: boolean;
}

function isConfigured(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/canvia|pendent|placeholder/i.test(value)
  );
}

export function hasRequiredLegalIdentity(
  name: string | undefined,
  email: string | undefined,
): boolean {
  return isConfigured(name) && isConfigured(email);
}

export async function getLegalIdentity(): Promise<LegalIdentity> {
  const { env } = await getCloudflareContext({ async: true });
  const name = env.LEGAL_CONTROLLER_NAME?.trim() ?? "";
  const email = env.LEGAL_CONTACT_EMAIL?.trim() ?? "";
  const ready = hasRequiredLegalIdentity(name, email);
  return { name, email, ready };
}
