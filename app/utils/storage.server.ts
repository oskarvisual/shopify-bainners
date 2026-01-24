import { db } from "../db.server";

export async function getStorageUsageMB(shopId: string): Promise<number> {
  const aggregate = await db.image.aggregate({
    where: { shopId },
    _sum: { sizeInMB: true },
  });

  return aggregate._sum.sizeInMB || 0;
}

export function getPlanStorageLimitGB(plan: string | null | undefined): number {
  const freeLimit = Number(process.env.PLAN_STORAGE_FREE_GB || 1);
  const proLimit = Number(process.env.PLAN_STORAGE_PRO_GB || 5);
  const ultraLimit = Number(process.env.PLAN_STORAGE_ULTRA_GB || 10);

  if (plan === "pro") return proLimit;
  if (plan === "ultra") return ultraLimit;
  return freeLimit;
}
