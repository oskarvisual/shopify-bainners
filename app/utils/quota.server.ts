import { db } from "../db.server";
import { getPlanLimits, normalizePlan } from "../lib/plans";

/**
 * AI quota enforcement.
 *
 * The n8n Data Table is the single source of truth for daily counters, so
 * both sides always agree on how many generations a shop has used. The app
 * asks n8n for the current usage before dispatching, and n8n re-checks the
 * limit on its side as a defence-in-depth measure.
 *
 * The database only stores a local mirror of the counters. That mirror is
 * used for fast UI rendering and as a fallback when n8n is unreachable.
 */

export type QuotaKind = "generation" | "upload";

export interface QuotaStatus {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetsAt: Date;
  reason?: string;
}

function startOfUtcDay(reference = new Date()): Date {
  const day = new Date(reference);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

function endOfUtcDay(reference = new Date()): Date {
  const day = startOfUtcDay(reference);
  day.setUTCDate(day.getUTCDate() + 1);
  return day;
}

function limitFor(plan: string | null | undefined, kind: QuotaKind): number {
  const limits = getPlanLimits(normalizePlan(plan));
  return kind === "generation"
    ? limits.aiGenerationsPerDay
    : limits.aiUploadsPerDay;
}

/**
 * Read the local mirror of the daily counter.
 *
 * The stored date is compared against the current UTC day, so counters roll
 * over lazily without needing a scheduled job.
 */
export async function getLocalQuotaUsage(
  shopId: string,
  kind: QuotaKind
): Promise<number> {
  const today = startOfUtcDay();
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      aiGenerationsToday: true,
      aiGenerationsDate: true,
      aiUploadsToday: true,
      aiUploadsDate: true,
    },
  });

  if (!shop) return 0;

  const counter =
    kind === "generation" ? shop.aiGenerationsToday : shop.aiUploadsToday;
  const counterDate =
    kind === "generation" ? shop.aiGenerationsDate : shop.aiUploadsDate;

  if (!counterDate) return 0;

  const storedDay = startOfUtcDay(new Date(counterDate));
  if (storedDay.getTime() !== today.getTime()) {
    return 0;
  }

  return counter || 0;
}

/**
 * Ask n8n for the authoritative usage for today.
 *
 * n8n replies with { used, limit }. When n8n cannot be reached we fall back
 * to the local mirror so the app stays usable, and we surface the limit from
 * the plan instead of the one n8n reports.
 */
export async function getRemoteQuotaUsage(
  shopDomain: string,
  plan: string | null | undefined,
  kind: QuotaKind
): Promise<{ used: number; limit: number; available: boolean }> {
  const endpoint = process.env.N8N_WEBHOOK_IMAGE_QUOTA?.trim();
  const limit = limitFor(plan, kind);

  if (!endpoint) {
    return { used: 0, limit, available: false };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AUTOMATIONS_TOKEN || ""}`,
      },
      body: JSON.stringify({
        shop: shopDomain,
        kind,
        plan: normalizePlan(plan),
        date: startOfUtcDay().toISOString().slice(0, 10),
      }),
    });

    if (!response.ok) {
      return { used: 0, limit, available: false };
    }

    const data = await response.json();
    const used = Number(data?.used);
    if (!Number.isFinite(used)) {
      return { used: 0, limit, available: false };
    }

    return {
      used,
      limit: Number.isFinite(Number(data?.limit)) ? Number(data.limit) : limit,
      available: true,
    };
  } catch {
    return { used: 0, limit, available: false };
  }
}

/**
 * Check whether the shop can perform one more action of the given kind.
 *
 * Prefers the n8n Data Table (authoritative). Falls back to the local mirror
 * when n8n is unreachable.
 */
export async function checkQuota(
  shopId: string,
  shopDomain: string,
  plan: string | null | undefined,
  kind: QuotaKind
): Promise<QuotaStatus> {
  const normalizedPlan = normalizePlan(plan);
  const limit = limitFor(normalizedPlan, kind);

  const remote = await getRemoteQuotaUsage(shopDomain, normalizedPlan, kind);
  const used = remote.available
    ? remote.used
    : await getLocalQuotaUsage(shopId, kind);
  const effectiveLimit = remote.available ? remote.limit : limit;

  const remaining = Math.max(0, effectiveLimit - used);

  return {
    allowed: used < effectiveLimit,
    used,
    limit: effectiveLimit,
    remaining,
    resetsAt: endOfUtcDay(),
    reason:
      used < effectiveLimit
        ? undefined
        : `Your ${normalizedPlan} plan allows ${effectiveLimit} AI ${
            kind === "generation" ? "generation" : "upload"
          }${effectiveLimit === 1 ? "" : "s"} per day. You've used all of them. The quota resets at ${endOfUtcDay().toISOString()}.`,
  };
}

/**
 * Update the local mirror of the daily counter.
 *
 * This is a mirror only: n8n owns the real count. It exists so the admin UI
 * can render usage without a round trip on every page load.
 */
export async function syncLocalQuota(
  shopId: string,
  kind: QuotaKind,
  used: number
): Promise<void> {
  const today = startOfUtcDay();

  if (kind === "generation") {
    await db.shop.update({
      where: { id: shopId },
      data: { aiGenerationsToday: used, aiGenerationsDate: today },
    });
    return;
  }

  await db.shop.update({
    where: { id: shopId },
    data: { aiUploadsToday: used, aiUploadsDate: today },
  });
}

/**
 * Storage gate: verify the shop has room for an additional amount of data.
 */
export async function checkStorageQuota(
  shopId: string,
  plan: string | null | undefined,
  incomingMB: number
): Promise<QuotaStatus> {
  const limits = getPlanLimits(normalizePlan(plan));
  const limitMB = limits.storageGB * 1024;

  const aggregate = await db.image.aggregate({
    where: { shopId },
    _sum: { sizeInMB: true },
  });
  const usedMB = aggregate._sum.sizeInMB || 0;
  const remaining = Math.max(0, limitMB - usedMB);
  const allowed = incomingMB <= remaining;

  return {
    allowed,
    used: usedMB,
    limit: limitMB,
    remaining,
    resetsAt: endOfUtcDay(),
    reason: allowed
      ? undefined
      : `Your ${normalizePlan(plan)} plan allows ${limits.storageGB} GB of storage and you are using ${(
          usedMB / 1024
        ).toFixed(2)} GB. This image needs ${(incomingMB / 1024).toFixed(2)} GB.`,
  };
}
