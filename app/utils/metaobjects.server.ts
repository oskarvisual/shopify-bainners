import { db } from "../db.server";

const METAOBJECT_TYPE = "bainners_banner";

async function ensureBannerMetaobjectDefinition(admin: any) {
  try {
    const existing = await admin.graphql(
      `
      query GetDefinition($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
        }
      }
      `,
      { variables: { type: METAOBJECT_TYPE } }
    );
    const existingJson = await existing.json();
    if (existingJson?.data?.metaobjectDefinitionByType?.id) {
      return;
    }
  } catch (error) {
    console.warn("Failed to check metaobject definition", error);
  }

  try {
    const response = await admin.graphql(
      `
      mutation CreateDefinition($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          definition: {
            name: "Bainners Banner",
            type: METAOBJECT_TYPE,
            displayNameKey: "title",
            access: {
              storefront: "PUBLIC_READ",
            },
            fieldDefinitions: [
              {
                name: "Banner ID",
                key: "banner_id",
                type: "single_line_text_field",
                required: true,
              },
              {
                name: "Title",
                key: "title",
                type: "single_line_text_field",
                required: true,
              },
              {
                name: "Status",
                key: "status",
                type: "single_line_text_field",
                required: false,
              },
              {
                name: "Thumbnail",
                key: "thumbnail",
                type: "single_line_text_field",
                required: false,
              },
            ],
          },
        },
      }
    );
    const json = await response.json();
    if (json?.data?.metaobjectDefinitionCreate?.userErrors?.length) {
      console.warn("Metaobject definition errors", json.data.metaobjectDefinitionCreate.userErrors);
    }
  } catch (error) {
    console.warn("Failed to create metaobject definition", error);
  }
}

/**
 * Sync the banner metaobjects for a shop.
 *
 * Existing metaobjects are updated in place (matched by handle) instead of
 * being deleted and recreated. Deleting them would break the references the
 * merchant configured in the Theme Editor.
 */
export async function syncAllBannerMetaobjects(admin: any, shopId: string) {
  if (!admin) return;

  await ensureBannerMetaobjectDefinition(admin);

  // Index the existing metaobjects by handle so we can update them in place.
  const existingByHandle = new Map<string, string>();
  try {
    const allMetaResponse = await admin.graphql(
      `query { metaobjects(first: 250, type: "${METAOBJECT_TYPE}") { nodes { id handle } } }`
    );
    const allMetaJson = await allMetaResponse.json();
    const existingMetaobjects = allMetaJson?.data?.metaobjects?.nodes || [];
    for (const meta of existingMetaobjects) {
      if (meta?.handle && meta?.id) {
        existingByHandle.set(meta.handle, meta.id);
      }
    }
  } catch (error) {
    console.error("[syncAllBannerMetaobjects] Failed to list existing metaobjects:", error);
  }

  const activeBanners = await db.banner.findMany({
    where: { shopId, status: "active" },
    select: {
      id: true,
      title: true,
      status: true,
      bannerItems: {
        orderBy: { displayOrder: "asc" },
        take: 1,
        select: {
          image: { select: { storageUrl: true } },
          externalImageUrl: true,
          tags: true,
        },
      },
    },
  });

  for (const banner of activeBanners) {
    const firstItem = banner.bannerItems[0];
    let thumbnail = "";

    if (firstItem) {
      const itemTags = (firstItem.tags as Record<string, any> | null) || {};
      if (itemTags.mediaType === "video") {
        const provider = itemTags.videoProvider;
        const videoId = itemTags.videoId;
        if (provider === "youtube" && videoId) {
          thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        } else if (provider === "vimeo" && videoId) {
          thumbnail = `https://vumbnail.com/${videoId}.jpg`;
        }
      } else {
        thumbnail = firstItem.image?.storageUrl || firstItem.externalImageUrl || "";
      }
    }

    const fields = [
      { key: "banner_id", value: banner.id },
      { key: "title", value: banner.title },
      { key: "status", value: banner.status },
      { key: "thumbnail", value: thumbnail },
    ];

    const handle = `banner-${banner.id}`;
    const existingId = existingByHandle.get(handle);

    try {
      if (existingId) {
        // Update in place so the Theme Editor references keep working.
        const updateResponse = await admin.graphql(
          `
          mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
            metaobjectUpdate(id: $id, metaobject: $metaobject) {
              metaobject { id }
              userErrors { field message }
            }
          }
          `,
          {
            variables: {
              id: existingId,
              metaobject: { fields },
            },
          }
        );
        const updateJson = await updateResponse.json();
        if (updateJson?.data?.metaobjectUpdate?.userErrors?.length > 0) {
          console.error(
            "[syncAllBannerMetaobjects] Update error for",
            banner.title,
            ":",
            updateJson.data.metaobjectUpdate.userErrors
          );
        }
        continue;
      }

      const createResponse = await admin.graphql(
        `
        mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $metaobject) {
            metaobject { id }
            userErrors { field message }
          }
        }
        `,
        {
          variables: {
            metaobject: {
              type: METAOBJECT_TYPE,
              handle,
              fields,
            },
          },
        }
      );
      const createJson = await createResponse.json();
      if (createJson?.data?.metaobjectCreate?.userErrors?.length > 0) {
        console.error(
          "[syncAllBannerMetaobjects] Create error for",
          banner.title,
          ":",
          createJson.data.metaobjectCreate.userErrors
        );
      }
    } catch (error) {
      console.error("[syncAllBannerMetaobjects] Failed to sync metaobject for", banner.title, ":", error);
    }
  }
}
