/**
 * Banner Types for Bainners App
 *
 * Complete type definitions for the AI banner generation flow
 */

// ============================================
// 1) Style Selection
// ============================================

export type StyleType = "system" | "custom";

export interface StylePreset {
  id: string;
  name: string;
  type: StyleType;
  category?: "luxury" | "sport" | "fashion" | "tech" | "outdoors" | "seasonal" | "minimal" | "bold";

  // Creative direction
  stylePrompt: string;
  negativePrompt?: string;
  toneKeywords?: string[];
  avoidTextInImage?: boolean;
  strictProductPreservation?: boolean;

  // Composition defaults
  defaultComposition?: "product_left" | "product_right" | "centered" | "rule_of_thirds";
  backgroundStyle?: "clean" | "gradient" | "studio" | "lifestyle" | "pattern";
  cameraFeel?: "wide" | "medium" | "close_up";
  depthOfField?: "none" | "subtle" | "strong";

  // Branding
  primaryColor?: string;
  accentColor?: string;
  backgroundColorHint?: string;
  allowGradients?: boolean;
  logoUsage?: "none" | "corner" | "watermark";

  // Compliance rules
  noExtraProducts?: boolean;
  noCompetingBrands?: boolean;
  noTextArtifacts?: boolean;
  familyFriendly?: boolean;
  allowedProps?: string[];
  forbiddenProps?: string[];
}

// ============================================
// 2) Banner Context (Product Info)
// ============================================

export interface BannerProductContext {
  productId?: string;
  productTitle?: string;
  productDescription?: string;
  collection?: string;
  productType?: string;
  price?: string;
  compareAtPrice?: string; // For sales
  onSale?: boolean;
  tags?: string[];
  vendor?: string;
}

// ============================================
// 3) User Prompt
// ============================================

export interface UserPrompt {
  text: string; // What the user wants
  feeling?: string; // "exciting", "calm", "premium", etc.
  visualContext?: string; // "outdoor", "studio", "night mood"
  objective?: "sale" | "launch" | "awareness" | "seasonal" | "product_highlight";
}

// ============================================
// 4) Reference Images
// ============================================

export type ReferenceMode = "strict" | "flexible";
export type BackgroundMode = "keep" | "replace" | "simplify";

export interface ReferenceImage {
  url?: string;
  base64?: string;
  source: "shopify_product" | "user_upload" | "existing_asset";
  productImageId?: string; // If from Shopify
}

export interface ReferenceSettings {
  images?: ReferenceImage[];
  mode?: ReferenceMode;
  backgroundMode?: BackgroundMode;
  useProductImages?: boolean;
}

// ============================================
// 5) Format & Dimensions
// ============================================

export type AspectRatio = "16:9" | "21:9" | "4:5" | "1:1" | "9:16";
export type ProductOrientation = "left" | "right" | "center" | "rule_of_thirds";

export interface FormatSettings {
  aspectRatio: AspectRatio;
  dimensions?: string; // "1920x1080", "1080x1350", etc.
  safeArea?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  productOrientation?: ProductOrientation;
}

// ============================================
// 6) Text Handling
// ============================================

export type TextMode = "overlay" | "embedded";

export interface TextOverlaySettings {
  title?: string;
  subtitle?: string;
  titleColor?: string;
  subtitleColor?: string;
  textPosition?: "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center" | "custom";
  customPosition?: {
    x: number;
    y: number;
  };
}

export interface TextEmbeddedSettings {
  headline?: string;
  subheadline?: string;
  language?: string;
  maxChars?: number;
  forceGenericFont?: boolean;
}

export interface TextSettings {
  mode: TextMode;
  overlay?: TextOverlaySettings;
  embedded?: TextEmbeddedSettings;
}

// ============================================
// 7) Call to Action (CTA)
// ============================================

export type CTAStyle = "button" | "link" | "badge";
export type CTATarget = "_self" | "_blank";

export interface CTASettings {
  text?: string;
  url?: string;
  target?: CTATarget;
  style?: CTAStyle;
  show?: boolean;
  backgroundColor?: string;
  textColor?: string;
}

// ============================================
// 8) Branding & Colors
// ============================================

export interface BrandingSettings {
  primaryColor?: string;
  secondaryColor?: string;
  allowGradients?: boolean;
  contrastLevel?: "low" | "medium" | "high";
  logoUrl?: string;
  logoPlacement?: "none" | "corner" | "watermark";
  logoOpacity?: number; // 0-100
}

// ============================================
// 9) Safety & Quality Rules (automatic)
// ============================================

export interface SafetyRules {
  noInventProducts: boolean;
  noCompetingBrands: boolean;
  noTextGarbage: boolean;
  noProductDeformation: boolean;
  noProhibitedElements: boolean;
  prohibitedElements?: string[];
}

// ============================================
// 10) Variants & Preview
// ============================================

export interface VariantSettings {
  count: number; // 2-4
  generatePreviewsOnly?: boolean;
  selectedVariantIndex?: number;
}

// ============================================
// Complete Banner Generation Request
// ============================================

export interface BannerGenerationRequest {
  // Identification
  shopId: string;
  bannerId?: string; // If editing existing
  requestId?: string; // For tracking

  // 1) Style
  style: {
    presetId?: string;
    preset?: StylePreset;
  };

  // 2) Product Context
  productContext?: BannerProductContext;

  // 3) User Prompt
  userPrompt: UserPrompt;

  // 4) Reference Images
  referenceSettings?: ReferenceSettings;

  // 5) Format & Dimensions
  formatSettings: FormatSettings;

  // 6) Text Settings
  textSettings: TextSettings;

  // 7) CTA
  ctaSettings?: CTASettings;

  // 8) Branding
  brandingSettings?: BrandingSettings;

  // 9) Safety Rules (auto-applied)
  safetyRules?: SafetyRules;

  // 10) Variants
  variantSettings: VariantSettings;

  // Additional metadata
  meta?: {
    plan?: "free" | "pro" | "ultra";
    userId?: string;
    createdAt?: string;
    [key: string]: any;
  };
}

// ============================================
// n8n Payload Structure (what gets sent)
// ============================================

export interface N8nBannerPayload {
  // App identification (from automation.server.ts)
  appId: string;
  shop: string;
  action: "generate" | "generate_preview" | "finalize";

  // Main content
  prompt: {
    user: string; // User's description
    system: string; // Anti-injection + style + rules
    negative: string; // Negative prompt
  };

  // Style information
  style: {
    id?: string;
    name?: string;
    type: StyleType;
    settings: Partial<StylePreset>;
  };

  // Product context (semantic info)
  product?: BannerProductContext;

  // Image references
  references?: {
    images?: Array<{
      url?: string;
      base64?: string;
      source: string;
    }>;
    mode: ReferenceMode;
    backgroundMode: BackgroundMode;
  };

  // Format specifications
  format: {
    aspectRatio: AspectRatio;
    dimensions: string;
    width: number;
    height: number;
    safeArea?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    productOrientation?: ProductOrientation;
  };

  // Text handling
  text: {
    mode: TextMode;
    overlay?: TextOverlaySettings;
    embedded?: TextEmbeddedSettings;
  };

  // CTA
  cta?: CTASettings;

  // Branding
  branding?: BrandingSettings;

  // Output settings
  output: {
    format: "png" | "jpg" | "webp";
    quality?: number;
    variantsCount: number;
    previewOnly: boolean;
  };

  // Safety and compliance
  safety: SafetyRules;

  // Metadata
  meta: {
    bannerId?: string;
    requestId?: string;
    plan?: string;
    dispatchedAt: string;
    [key: string]: any;
  };
}

// ============================================
// n8n Response Structure
// ============================================

export interface N8nBannerResponse {
  success: boolean;
  requestId?: string;
  action: "generate" | "generate_preview" | "finalize";

  // Single variant (for finalize)
  image?: {
    url: string;
    cdnUrl: string;
    width: number;
    height: number;
    sizeInMB: number;
    format: string;
  };

  // Multiple variants (for generate_preview)
  variants?: Array<{
    variantIndex: number;
    previewUrl: string;
    cdnUrl?: string;
    width: number;
    height: number;
    sizeInMB: number;
    format: string;
    seed?: number; // For reproducibility
  }>;

  // Generation info
  generation?: {
    model: string;
    processingTime: number;
    cost?: number;
    tokensUsed?: number;
  };

  error?: string;
  errorCode?: string;
}
