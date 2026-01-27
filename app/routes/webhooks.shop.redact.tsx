import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Shop redact request:", payload);

  const shopDomain = payload.shop_domain;

  try {
    console.log(`Redacting all data for shop: ${shopDomain}`);
    await db.shop.deleteMany({ where: { shopDomain } });
    console.log(`Successfully redacted all data for shop: ${shopDomain}`);
  } catch (error) {
    console.error("Error processing shop redaction:", error);
  }

  return new Response(null, { status: 200 });
};
