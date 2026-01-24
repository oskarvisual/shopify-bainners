import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useActionData, useNavigate, useSearchParams } from "@remix-run/react";
import { BannerCreateModal } from "../components/BannerCreateModal";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { getPlanStorageLimitGB } from "../utils/storage.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") || "/app/banners";
  return redirect(returnTo);
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") || undefined;
  const shop = session?.shop || shopParam;

  if (!shop) {
    return json({ error: "Missing shop domain" }, { status: 400 });
  }

  const formData = await request.formData();
  const isModal =
    url.searchParams.get("modal") === "1" || formData.get("modal") === "1";

  // Get shop record with plan
  let shopRecord = await db.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (!shopRecord) {
    shopRecord = await db.shop.create({
      data: {
        shopDomain: shop,
        plan: "free",
        storageLimitGB: getPlanStorageLimitGB("free"),
      },
    });
  }

  try {
    const banner = await db.banner.create({
      data: {
        shopId: shopRecord.id,
        title: (formData.get("title") as string) || "Untitled banner",
        descriptionInternal: (formData.get("description") as string) || null,
        status: "draft",
        layout: (formData.get("layout") as string) || "hero",
        displayOrder: await getNextDisplayOrder(shopRecord.id),
      },
    });

    const redirectUrl = new URL(`/app/banners/${banner.id}/edit`, request.url);
    const redirectSearch = new URLSearchParams(url.search);
    redirectSearch.delete("modal");
    redirectSearch.delete("returnTo");
    redirectUrl.search = redirectSearch.toString() ? `?${redirectSearch.toString()}` : "";

    if (isModal) {
      return json({ redirectTo: redirectUrl.toString() });
    }

    return redirect(redirectUrl.toString());
  } catch (error) {
    console.error("Error creating banner:", error);
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function getNextDisplayOrder(shopId: string): Promise<number> {
  const lastBanner = await db.banner.findFirst({
    where: { shopId },
    orderBy: { displayOrder: "desc" },
  });

  return lastBanner ? lastBanner.displayOrder + 1 : 0;
}

export default function NewBanner() {
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fallbackParams = new URLSearchParams(searchParams);
  fallbackParams.delete("returnTo");
  const fallbackReturnTo = `/app/banners${
    fallbackParams.toString() ? `?${fallbackParams.toString()}` : ""
  }`;
  const returnTo = searchParams.get("returnTo") || fallbackReturnTo;
  const actionUrl = `/app/banners/new?${searchParams.toString()}`;

  return (
    <BannerCreateModal
      open
      actionUrl={actionUrl}
      onClose={() => navigate(returnTo)}
      error={actionData?.error}
    />
  );
}
