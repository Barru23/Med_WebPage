import Stripe from "stripe";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Stripe client for the Workers runtime. The default Node HTTP client and
 * Node crypto aren't available here, so we use Stripe's fetch-based client;
 * webhook signature verification uses the matching Web Crypto provider
 * (see src/app/api/webhooks/stripe/route.ts).
 */
export async function getStripe(): Promise<Stripe> {
  const { env } = await getCloudflareContext({ async: true });
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
