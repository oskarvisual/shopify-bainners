/**
 * n8n Integration Helper
 *
 * Simple client to communicate with n8n webhooks.
 * n8n handles all complex operations: AI generation, S3 upload, optimization, etc.
 *
 * NOTE: This file is now integrated with automation.server.ts for better tracking.
 * You can use either:
 * - Functions here (simpler, backward compatible)
 * - Functions in automation.server.ts (more features, better tracking)
 */

import {
  dispatchImageAutomation,
  generateBannerWithAI,
  uploadBannerImage,
  optimizeBannerImage,
  deleteImageFromS3,
  type AutomationMeta,
} from "./automation.server";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_IMAGE_PROCESSOR || "";
const N8N_TOKEN = process.env.AUTOMATIONS_TOKEN || process.env.N8N_TOKEN || "";

export type ImageAction = "generate" | "upload" | "optimize";

export interface N8nImageRequest {
  action: ImageAction;
  shopId: string;
  requestId?: string; // GenerationRequest.id for tracking

  // For "generate" action
  generate?: {
    prompt: string;
    stylePrompt?: string;
    negativePrompt?: string;
    productContext?: Record<string, any>;
    referenceImages?: string | string[]; // URLs or base64
    format: string; // "16:9", "4:5", etc.
    dimensions: string; // "1920x800"
    variantsCount?: number; // How many variants to generate
    compositionSettings?: Record<string, any>;
  };

  // For "upload" action (user uploads file from frontend)
  upload?: {
    imageBase64: string;
    fileName: string;
    optimize?: boolean; // Should n8n optimize it?
  };

  // For "optimize" action (existing image)
  optimize?: {
    imageUrl: string; // Existing S3 or Shopify URL
    targetFormat?: string; // "webp", "png"
    maxSizeMB?: number;
  };
}

export interface N8nImageResponse {
  success: boolean;
  action: ImageAction;
  requestId?: string;

  // For single image operations (upload, optimize)
  imageUrl?: string;
  cdnUrl?: string;
  sizeInMB?: number;
  width?: number;
  height?: number;
  format?: string;

  // For generate action (multiple variants)
  variants?: Array<{
    imageUrl: string;
    cdnUrl: string;
    sizeInMB: number;
    width: number;
    height: number;
    format: string;
    variantIndex: number;
  }>;

  error?: string;
}

/**
 * Send a request to n8n image processor webhook
 *
 * @deprecated Consider using dispatchImageAutomation() from automation.server.ts
 * for better tracking and consistency with shopify-qa patterns.
 */
export async function processImageWithN8n(
  request: N8nImageRequest
): Promise<N8nImageResponse> {
  if (!N8N_WEBHOOK_URL) {
    throw new Error("N8N_WEBHOOK_IMAGE_PROCESSOR is not configured");
  }

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${N8N_TOKEN}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n webhook failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data as N8nImageResponse;
  } catch (error) {
    console.error("Error calling n8n webhook:", error);
    return {
      success: false,
      action: request.action,
      requestId: request.requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate image(s) with AI via n8n
 */
export async function generateImageWithAI(params: {
  shopId: string;
  requestId: string;
  prompt: string;
  stylePrompt?: string;
  negativePrompt?: string;
  productContext?: Record<string, any>;
  referenceImages?: string | string[];
  format: string;
  dimensions: string;
  variantsCount?: number;
  compositionSettings?: Record<string, any>;
}): Promise<N8nImageResponse> {
  return processImageWithN8n({
    action: "generate",
    shopId: params.shopId,
    requestId: params.requestId,
    generate: {
      prompt: params.prompt,
      stylePrompt: params.stylePrompt,
      negativePrompt: params.negativePrompt,
      productContext: params.productContext,
      referenceImages: params.referenceImages,
      format: params.format,
      dimensions: params.dimensions,
      variantsCount: params.variantsCount || 2,
      compositionSettings: params.compositionSettings,
    },
  });
}

/**
 * Upload user image to S3 via n8n
 */
export async function uploadImageToS3(params: {
  shopId: string;
  imageBase64: string;
  fileName: string;
  optimize?: boolean;
}): Promise<N8nImageResponse> {
  return processImageWithN8n({
    action: "upload",
    shopId: params.shopId,
    upload: {
      imageBase64: params.imageBase64,
      fileName: params.fileName,
      optimize: params.optimize ?? true,
    },
  });
}

/**
 * Optimize an existing image via n8n
 */
export async function optimizeImage(params: {
  shopId: string;
  imageUrl: string;
  targetFormat?: string;
  maxSizeMB?: number;
}): Promise<N8nImageResponse> {
  return processImageWithN8n({
    action: "optimize",
    shopId: params.shopId,
    optimize: {
      imageUrl: params.imageUrl,
      targetFormat: params.targetFormat,
      maxSizeMB: params.maxSizeMB,
    },
  });
}

// ============================================
// Re-export automation functions for convenience
// ============================================

/**
 * Re-export automation functions so they can be imported from n8n.server.ts
 * This maintains backward compatibility while providing access to new features
 */
export {
  dispatchImageAutomation,
  generateBannerWithAI,
  uploadBannerImage,
  optimizeBannerImage,
  deleteImageFromS3,
  type AutomationMeta,
};
