import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Customer redact request:", payload);

  const customerId = payload.customer?.id;
  const customerEmail = payload.customer?.email;
  const shopDomain = payload.shop_domain;

  try {
    console.log(
      `Redacting data for customer ${customerId} (${customerEmail}) from shop ${shopDomain}`
    );
    // No customer PII stored in this app. Nothing to redact.
  } catch (error) {
    console.error("Error processing customer redaction:", error);
  }

  return new Response(null, { status: 200 });
};
