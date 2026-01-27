import { db } from "../db.server";

export async function gatherCustomerData(
  shop: string,
  customerEmail?: string,
  customerId?: string
) {
  return {
    customer: {
      email: customerEmail || null,
      shopifyId: customerId || null,
      shop,
    },
    banners: [],
    images: [],
    analytics: [],
    dataGatheredAt: new Date().toISOString(),
  };
}

export async function logGdprRequest({
  shop,
  requestType,
  customerEmail,
  customerId,
  payload,
}: {
  shop: string;
  requestType: string;
  customerEmail?: string;
  customerId?: string;
  payload?: Record<string, any>;
}) {
  return db.gdprRequest.create({
    data: {
      shop,
      requestType,
      customerEmail: customerEmail || null,
      customerId: customerId || null,
      payload: payload ? JSON.stringify(payload) : null,
      status: "pending",
    },
  });
}

export async function updateGdprRequestStatus(id: string, status: string) {
  return db.gdprRequest.update({
    where: { id },
    data: {
      status,
      processedAt: status === "completed" ? new Date() : undefined,
    },
  });
}

export function formatCustomerDataAsJson(customerData: unknown) {
  return JSON.stringify(customerData, null, 2);
}

export async function sendCustomerDataByEmail(
  customerEmail?: string,
  customerData?: unknown,
  shop?: string
) {
  console.log("[GDPR] No customer email delivery configured", {
    shop,
    customerEmail,
    summary: customerData ? "data included" : "no data",
  });
  return { success: true, message: "No email delivery configured" };
}
