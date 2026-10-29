import { getAiModelForPlan, normalizePlan } from "../lib/plans";

/**
 * Aspect ratio and resolution constraints per KIE model.
 *
 * The KIE API validates these strictly and rejects anything outside the
 * allowed set with:
 *   "This aspect_ratio is not within the range of allowed options"
 *
 * Verified against the live KIE API (2026-10-29):
 *
 *   flux-2/pro-text-to-image  (free plan)
 *     aspect ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9
 *     resolutions:   1K, 2K        (4K is rejected)
 *
 *   nano-banana-pro           (pro / ultra plans)
 *     aspect ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9, auto
 *     resolutions:   1K, 2K        (4K is rejected by the API)
 */
export const MODEL_ASPECT_RATIOS: Record<string, string[]> = {
  "flux-2/pro-text-to-image": ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"],
  "nano-banana-pro": [
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
    "auto",
  ],
  "google/nano-banana": [
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
    "auto",
  ],
};

export const MODEL_RESOLUTIONS: Record<string, string[]> = {
  "flux-2/pro-text-to-image": ["1K", "2K"],
  "nano-banana-pro": ["1K", "2K"],
  "google/nano-banana": ["1K", "2K"],
};

/**
 * Fallback used when a model is unknown: the safest common denominator.
 */
const DEFAULT_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"];

/**
 * Closest equivalent aspect ratio when the requested one is not supported.
 *
 * The mapping keeps the visual intent as close as possible:
 *   4:5  (portrait 0.8)  -> 3:4  (portrait 0.75)
 *   5:4  (landscape 1.25) -> 4:3  (landscape 1.33)
 *   21:9 (ultrawide 2.33) -> 16:9 (wide 1.78)
 *   auto                 -> 1:1
 */
const ASPECT_RATIO_FALLBACK: Record<string, string> = {
  "4:5": "3:4",
  "5:4": "4:3",
  "21:9": "16:9",
  auto: "1:1",
};

export function getAllowedAspectRatiosForModel(model: string): string[] {
  return MODEL_ASPECT_RATIOS[model] || DEFAULT_ASPECT_RATIOS;
}

export function getAllowedResolutionsForModel(model: string): string[] {
  return MODEL_RESOLUTIONS[model] || ["1K"];
}

/**
 * Translate an aspect ratio into one the given model accepts.
 *
 * Returns the original value when it is already valid, so the common case
 * (the user picked a supported ratio) is untouched.
 */
export function normalizeAspectRatioForModel(
  aspectRatio: string | null | undefined,
  model: string
): { ratio: string; translated: boolean } {
  const requested = (aspectRatio || "1:1").trim();
  const allowed = getAllowedAspectRatiosForModel(model);

  if (allowed.includes(requested)) {
    return { ratio: requested, translated: false };
  }

  const fallback = ASPECT_RATIO_FALLBACK[requested];
  if (fallback && allowed.includes(fallback)) {
    return { ratio: fallback, translated: true };
  }

  // Last resort: the first ratio the model accepts.
  return { ratio: allowed[0] || "1:1", translated: true };
}

/**
 * Translate a resolution into one the given model accepts.
 */
export function normalizeResolutionForModel(
  resolution: string | null | undefined,
  model: string
): { resolution: string; translated: boolean } {
  const requested = (resolution || "1K").trim();
  const allowed = getAllowedResolutionsForModel(model);

  if (allowed.includes(requested)) {
    return { resolution: requested, translated: false };
  }

  return { resolution: allowed[0] || "1K", translated: true };
}

/**
 * Full translation for a plan: resolves the model first, then the ratio and
 * the resolution against that model's constraints.
 */
export function normalizeForPlan(plan: string | null | undefined, input: {
  aspectRatio?: string | null;
  resolution?: string | null;
}): {
  model: string;
  aspectRatio: string;
  resolution: string;
  translated: boolean;
} {
  const model = getAiModelForPlan(normalizePlan(plan));
  const ratio = normalizeAspectRatioForModel(input.aspectRatio, model);
  const res = normalizeResolutionForModel(input.resolution, model);

  return {
    model,
    aspectRatio: ratio.ratio,
    resolution: res.resolution,
    translated: ratio.translated || res.translated,
  };
}

/**
 * Aspect ratios that can be offered in the UI for a given plan.
 *
 * The list is the intersection of what the UI wants to show and what the
 * plan's model actually accepts, so the user can never pick a ratio that
 * the API will reject.
 */
export function getAspectRatiosForPlan(plan: string | null | undefined): string[] {
  const model = getAiModelForPlan(normalizePlan(plan));
  const modelRatios = getAllowedAspectRatiosForModel(model);

  // Keep the order the UI expects, filtered by what the model supports.
  const preferred = [
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
    "auto",
  ];

  return preferred.filter((ratio) => modelRatios.includes(ratio));
}

/**
 * Resolutions that can be offered in the UI for a given plan.
 */
export function getResolutionsForPlan(plan: string | null | undefined): string[] {
  const model = getAiModelForPlan(normalizePlan(plan));
  const modelResolutions = getAllowedResolutionsForModel(model);

  const preferred = ["1K", "2K", "4K"];
  return preferred.filter((res) => modelResolutions.includes(res));
}
