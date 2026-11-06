/**
 * Automation System for Bainners
 *
 * Similar to shopify-qa, this handles dispatching webhooks to n8n
 * with proper authentication, tracking, and payload structure.
 *
 * Inspired by: /Users/oscarfernandez/Projects/Shopify/shopify-qa/app/lib/automation.server.js
 */
import { normalizeForPlan } from "./aspect-ratio";

// ============================================
// Configuration
// ============================================

const AUTOMATIONS_APP_ID =
  process.env.AUTOMATIONS_APP_ID ||
  process.env.SHOPIFY_APP_HANDLE ||
  process.env.SHOPIFY_API_KEY ||
  "shopify-bainners";

const AUTOMATIONS_GLOBAL_TOKEN = process.env.AUTOMATIONS_TOKEN?.trim() || null;

// ============================================
// Types
// ============================================

export interface AutomationMeta {
  bannerId?: string;
  stylePresetId?: string;
  plan?: string;
  features?: Record<string, any>;
  [key: string]: any;
}

export interface ImageGenerationPayload {
  action: "generate" | "upload" | "optimize";
  shop: string;
  app: string;

  // Common fields
  prompt?: string;
  aspect_ratio?: string;
  resolution?: string;
  output_format?: string;

  // Additional generation fields
  stylePrompt?: string;
  negativePrompt?: string;
  productContext?: Record<string, any>;
  referenceImages?: string | string[];
  variantsCount?: number;
  compositionSettings?: Record<string, any>;

  // Upload fields
  imageBase64?: string;
  fileName?: string;
  mimeType?: string;
  optimize?: boolean;

  // Storage tracking
  storageUsedMB?: number;

  // Optimize fields
  imageUrl?: string;
  targetFormat?: string;
  maxSizeMB?: number;

  // Quota enforcement (n8n re-validates these as defence in depth)
  plan?: string;
  aiModel?: string;
  aiGenerationsUsedToday?: number;
  aiGenerationsLimit?: number;
  aiUploadsUsedToday?: number;
  aiUploadsLimit?: number;
}

export interface DispatchImageAutomationParams {
  shop: string;
  action: "generate" | "upload" | "optimize";
  payload: ImageGenerationPayload;
  plan?: string; // Plan de la tienda: free, pro, ultra
  meta?: AutomationMeta;
  token?: string;
}

export interface DispatchWebhookAutomationParams {
  shop: string;
  topic: string;
  target: string;
  payload: any;
  method?: string;
  headers?: Record<string, string>;
  meta?: AutomationMeta;
  token?: string;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Build authentication headers with Bearer token
 * Similar to shopify-qa's buildAuthHeaders()
 */
function buildAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const resolvedToken = token?.trim() || AUTOMATIONS_GLOBAL_TOKEN;
  if (resolvedToken) {
    headers.Authorization = `Bearer ${resolvedToken}`;
  }

  return headers;
}

/**
 * Log automation dispatch for debugging
 */
function logAutomationDispatch(
  type: string,
  shop: string,
  action: string,
  success: boolean,
  error?: string
) {
  const timestamp = new Date().toISOString();
  const status = success ? "✓" : "✗";

  console.log(
    `[${timestamp}] ${status} Automation ${type} - Shop: ${shop}, Action: ${action}${
      error ? `, Error: ${error}` : ""
    }`
  );
}

// ============================================
// Main Dispatch Functions
// ============================================

/**
 * Resolve the n8n webhook for a given action.
 *
 * Each action has its own workflow on the n8n side:
 *   - generate  -> creates the AI task and enforces the daily quota
 *   - upload    -> stores the uploaded file on the Spaces bucket
 *   - optimize  -> re-encodes an existing image
 *
 * When a dedicated webhook is not configured we fall back to the shared
 * processor so older deployments keep working.
 */
function resolveEndpoint(action: string): string | undefined {
  const dedicated: Record<string, string | undefined> = {
    generate: process.env.N8N_WEBHOOK_IMAGE_PROCESSOR,
    upload: process.env.N8N_WEBHOOK_IMAGE_UPLOAD,
    optimize: process.env.N8N_WEBHOOK_IMAGE_OPTIMIZE,
  };

  const target = dedicated[action]?.trim() || process.env.N8N_WEBHOOK_IMAGE_PROCESSOR?.trim();
  return target || undefined;
}

/**
 * Dispatch image processing automation to n8n
 * This sends image generation/upload/optimize requests to the n8n webhook
 *
 * Similar to shopify-qa's dispatchWebhookAutomation but specialized for images
 */
export async function dispatchImageAutomation({
  shop,
  action,
  payload,
  plan = "free",
  meta = {},
  token,
}: DispatchImageAutomationParams): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  const endpoint = resolveEndpoint(action);

  if (!endpoint) {
    console.warn(
      `Webhook for "${action}" is not set; skipping image automation dispatch.`
    );
    return {
      success: false,
      error: `N8N webhook for "${action}" not configured`,
    };
  }

  // Build the automation payload similar to shopify-qa structure.
  // The spread comes first so the canonical fields below always win.
  const automationPayload = {
    ...payload, // Spread the image-specific payload
    appId: AUTOMATIONS_APP_ID,
    shop,
    app: AUTOMATIONS_APP_ID, // Añadir app (duplicado de appId para compatibilidad)
    action,
    plan: payload.plan || plan, // Plan de la tienda
    meta: {
      ...meta,
      plan: payload.plan || plan, // También en meta
      dispatchedAt: new Date().toISOString(),
    },
  };

  try {
    const requestBody = JSON.stringify(automationPayload);
    const requestHeaders = buildAuthHeaders(token);

    console.log(`[n8n] Dispatching ${action} automation for shop: ${shop}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeaders,
      body: requestBody,
    });

    // Parse response JSON
    const data = await response.json();

    // Status != 200 = Error
    if (!response.ok) {
      // n8n returns { message: "error description" } on error
      const errorMessage = data.message || `n8n webhook failed with status ${response.status}`;

      logAutomationDispatch("image", shop, action, false, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }

    // Status 200 = Success (sync)
    // n8n returns { message: "", filename: "...", url: "..." }
    logAutomationDispatch("image", shop, action, true);

    return {
      success: true,
      data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logAutomationDispatch("image", shop, action, false, errorMessage);

    console.error("[n8n] Error calling webhook:", error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function dispatchImageStatus({
  shop,
  payload,
  token,
}: {
  shop: string;
  payload: Record<string, any>;
  token?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const statusEndpoint = process.env.N8N_WEBHOOK_IMAGE_STATUS?.trim();

  if (!statusEndpoint) {
    return { success: false, error: "N8N_WEBHOOK_IMAGE_STATUS not configured" };
  }

  try {
    const requestHeaders = buildAuthHeaders(token);
    const response = await fetch(statusEndpoint, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    const data = rawText ? JSON.parse(rawText) : {};

    if (!response.ok) {
      const errorMessage =
        data?.message || `n8n status webhook failed with status ${response.status}`;
      return { success: false, error: errorMessage };
    }

    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[n8n] Error calling status webhook:", error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Dispatch general webhook automation (for custom webhooks, notifications, etc.)
 * Similar to shopify-qa's dispatchWebhookAutomation
 *
 * This is useful for:
 * - Sending banner events to custom webhooks
 * - Analytics events
 * - User-configured integrations
 */
export async function dispatchWebhookAutomation({
  shop,
  topic,
  target,
  payload,
  method = "POST",
  headers = {},
  meta = {},
  token,
}: DispatchWebhookAutomationParams): Promise<{
  success: boolean;
  error?: string;
}> {
  const endpoint = process.env.AUTOMATIONS_WEBHOOK_URL?.trim();

  if (!endpoint) {
    console.warn(
      "AUTOMATIONS_WEBHOOK_URL env var is not set; skipping webhook automation dispatch."
    );
    return {
      success: false,
      error: "AUTOMATIONS_WEBHOOK_URL not configured",
    };
  }

  const automationPayload = {
    appId: AUTOMATIONS_APP_ID,
    shop,
    topic,
    target: {
      url: target,
      method,
      headers,
      body: payload,
    },
    meta: {
      ...meta,
      dispatchedAt: new Date().toISOString(),
    },
  };

  try {
    const requestBody = JSON.stringify(automationPayload);
    const requestHeaders = buildAuthHeaders(token);

    console.log(`[webhook] Dispatching ${topic} automation for shop: ${shop}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeaders,
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `Webhook automation failed: ${response.status} - ${errorText}`;

      logAutomationDispatch("webhook", shop, topic, false, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }

    logAutomationDispatch("webhook", shop, topic, true);

    return {
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logAutomationDispatch("webhook", shop, topic, false, errorMessage);

    console.error("[webhook] Error calling automation webhook:", error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Quick helper to generate banner image with AI
 * Uses the format the user tested in Postman
 */
export async function generateBannerWithAI(params: {
  shop: string;
  prompt: string;
  aspect_ratio?: string;
  resolution?: string;
  output_format?: string;
  stylePrompt?: string;
  negativePrompt?: string;
  productContext?: Record<string, any>;
  referenceImages?: string | string[];
  variantsCount?: number;
  plan?: string;
  meta?: AutomationMeta;
}): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  // Normaliza el aspect ratio y la resolucion a los que acepta el modelo
  // del plan. KIE rechaza con "not within the range of allowed options"
  // cualquier valor fuera de su lista (p.ej. Flux no acepta "auto").
  const normalized = normalizeForPlan(params.plan, {
    aspectRatio: params.aspect_ratio,
    resolution: params.resolution,
  });

  return dispatchImageAutomation({
    shop: params.shop,
    action: "generate",
    plan: params.plan,
    payload: {
      action: "generate",
      shop: params.shop,
      app: AUTOMATIONS_APP_ID,
      prompt: params.prompt,
      aspect_ratio: normalized.aspectRatio,
      resolution: normalized.resolution,
      output_format: params.output_format || "png",
      aiModel: normalized.model,
      stylePrompt: params.stylePrompt,
      negativePrompt: params.negativePrompt,
      productContext: params.productContext,
      referenceImages: params.referenceImages,
      variantsCount: params.variantsCount || 2,
    },
    meta: params.meta,
  });
}

/**
 * Upload banner image to storage
 */
export async function uploadBannerImage(params: {
  shop: string;
  imageBase64: string;
  fileName: string;
  optimize?: boolean;
  meta?: AutomationMeta;
}): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  return dispatchImageAutomation({
    shop: params.shop,
    action: "upload",
    payload: {
      action: "upload",
      shop: params.shop,
      app: AUTOMATIONS_APP_ID,
      imageBase64: params.imageBase64,
      fileName: params.fileName,
      optimize: params.optimize ?? true,
    },
    meta: params.meta,
  });
}

/**
 * Optimize existing banner image
 */
export async function optimizeBannerImage(params: {
  shop: string;
  imageUrl: string;
  targetFormat?: string;
  maxSizeMB?: number;
  meta?: AutomationMeta;
}): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  return dispatchImageAutomation({
    shop: params.shop,
    action: "optimize",
    payload: {
      action: "optimize",
      shop: params.shop,
      app: AUTOMATIONS_APP_ID,
      imageUrl: params.imageUrl,
      targetFormat: params.targetFormat,
      maxSizeMB: params.maxSizeMB,
    },
    meta: params.meta,
  });
}

/**
 * Delete image from S3 bucket
 */
export async function deleteImageFromS3(params: {
  shop: string;
  filename: string;
  meta?: AutomationMeta;
}): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  const endpoint = process.env.N8N_WEBHOOK_IMAGE_DELETE?.trim();

  if (!endpoint) {
    console.warn(
      "N8N_WEBHOOK_IMAGE_DELETE env var is not set; skipping image deletion."
    );
    return {
      success: false,
      error: "N8N_WEBHOOK_IMAGE_DELETE not configured",
    };
  }

  const payload = {
    appId: AUTOMATIONS_APP_ID,
    shop: params.shop,
    app: AUTOMATIONS_APP_ID,
    action: "delete",
    filename: params.filename,
    meta: {
      ...params.meta,
      dispatchedAt: new Date().toISOString(),
    },
  };

  try {
    const requestBody = JSON.stringify(payload);
    const requestHeaders = buildAuthHeaders();

    console.log(`[n8n] Deleting image for shop: ${params.shop}, file: ${params.filename}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: requestHeaders,
      body: requestBody,
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.message || `Delete failed with status ${response.status}`;

      logAutomationDispatch("delete", params.shop, "delete", false, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }

    logAutomationDispatch("delete", params.shop, "delete", true);

    return {
      success: true,
      data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logAutomationDispatch("delete", params.shop, "delete", false, errorMessage);

    console.error("[n8n] Error deleting image:", error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}


// ============================================
// Exports
// ============================================

export {
  AUTOMATIONS_APP_ID,
  buildAuthHeaders,
};
