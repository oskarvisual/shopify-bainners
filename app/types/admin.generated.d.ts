/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.d.ts';

export type HomeGetActiveSubscriptionsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type HomeGetActiveSubscriptionsQuery = { currentAppInstallation: { activeSubscriptions: Array<(
      Pick<AdminTypes.AppSubscription, 'id' | 'name' | 'status'>
      & { lineItems: Array<{ plan: { pricingDetails: { price: Pick<AdminTypes.MoneyV2, 'amount'> } } }> }
    )> } };

export type HomeEnsureDefinitionQueryVariables = AdminTypes.Exact<{
  type: AdminTypes.Scalars['String']['input'];
}>;


export type HomeEnsureDefinitionQuery = { metaobjectDefinitionByType?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'id'>> };

export type HomeCreateDefinitionMutationVariables = AdminTypes.Exact<{
  definition: AdminTypes.MetaobjectDefinitionCreateInput;
}>;


export type HomeCreateDefinitionMutation = { metaobjectDefinitionCreate?: AdminTypes.Maybe<{ metaobjectDefinition?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'id'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message'>> }> };

export type BannerEditEnsureDefinitionQueryVariables = AdminTypes.Exact<{
  type: AdminTypes.Scalars['String']['input'];
}>;


export type BannerEditEnsureDefinitionQuery = { metaobjectDefinitionByType?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'id'>> };

export type BannerEditCreateDefinitionMutationVariables = AdminTypes.Exact<{
  definition: AdminTypes.MetaobjectDefinitionCreateInput;
}>;


export type BannerEditCreateDefinitionMutation = { metaobjectDefinitionCreate?: AdminTypes.Maybe<{ metaobjectDefinition?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'id'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message'>> }> };

export type BannerEditListBannersQueryVariables = AdminTypes.Exact<{
  type: AdminTypes.Scalars['String']['input'];
}>;


export type BannerEditListBannersQuery = { metaobjects: { nodes: Array<Pick<AdminTypes.Metaobject, 'id'>> } };

export type BannerEditDeleteBannerMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type BannerEditDeleteBannerMutation = { metaobjectDelete?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDeletePayload, 'deletedId'>> };

export type BannerEditCreateBannerMutationVariables = AdminTypes.Exact<{
  metaobject: AdminTypes.MetaobjectCreateInput;
}>;


export type BannerEditCreateBannerMutation = { metaobjectCreate?: AdminTypes.Maybe<{ metaobject?: AdminTypes.Maybe<Pick<AdminTypes.Metaobject, 'id'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message'>> }> };

export type BannerEditGetProductsQueryVariables = AdminTypes.Exact<{
  first: AdminTypes.Scalars['Int']['input'];
}>;


export type BannerEditGetProductsQuery = { products: { nodes: Array<(
      Pick<AdminTypes.Product, 'id' | 'title' | 'handle' | 'status'>
      & { featuredImage?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>>, images: { nodes: Array<Pick<AdminTypes.Image, 'id' | 'url' | 'width' | 'height'>> } }
    )> } };

export type BannerEditGetFilesQueryVariables = AdminTypes.Exact<{
  first: AdminTypes.Scalars['Int']['input'];
}>;


export type BannerEditGetFilesQuery = { files: { nodes: Array<(
      Pick<AdminTypes.ExternalVideo, 'id' | 'alt' | 'fileStatus'>
      & { preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'width' | 'height'>> }> }
    ) | (
      Pick<AdminTypes.GenericFile, 'id' | 'alt' | 'fileStatus'>
      & { preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'width' | 'height'>> }> }
    ) | (
      Pick<AdminTypes.MediaImage, 'id' | 'alt' | 'fileStatus'>
      & { image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'width' | 'height'>>, preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'width' | 'height'>> }> }
    ) | (
      Pick<AdminTypes.Model3d, 'id' | 'alt' | 'fileStatus'>
      & { preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'width' | 'height'>> }> }
    ) | (
      Pick<AdminTypes.Video, 'id' | 'alt' | 'fileStatus'>
      & { preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'width' | 'height'>> }> }
    )> } };

export type BannerIndexEnsureDefinitionQueryVariables = AdminTypes.Exact<{
  type: AdminTypes.Scalars['String']['input'];
}>;


export type BannerIndexEnsureDefinitionQuery = { metaobjectDefinitionByType?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'id'>> };

export type BannerIndexCreateDefinitionMutationVariables = AdminTypes.Exact<{
  definition: AdminTypes.MetaobjectDefinitionCreateInput;
}>;


export type BannerIndexCreateDefinitionMutation = { metaobjectDefinitionCreate?: AdminTypes.Maybe<{ metaobjectDefinition?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'id'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message'>> }> };

export type BannerIndexListBannersQueryVariables = AdminTypes.Exact<{
  type: AdminTypes.Scalars['String']['input'];
}>;


export type BannerIndexListBannersQuery = { metaobjects: { nodes: Array<Pick<AdminTypes.Metaobject, 'id'>> } };

export type BannerIndexDeleteBannerMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type BannerIndexDeleteBannerMutation = { metaobjectDelete?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDeletePayload, 'deletedId'>> };

export type BannerIndexCreateBannerMutationVariables = AdminTypes.Exact<{
  metaobject: AdminTypes.MetaobjectCreateInput;
}>;


export type BannerIndexCreateBannerMutation = { metaobjectCreate?: AdminTypes.Maybe<{ metaobject?: AdminTypes.Maybe<Pick<AdminTypes.Metaobject, 'id'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message'>> }> };

export type CurrentInstallationQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type CurrentInstallationQuery = { currentAppInstallation: { activeSubscriptions: Array<Pick<AdminTypes.AppSubscription, 'id' | 'name' | 'status'>> } };

export type AppSubscriptionCreateMutationVariables = AdminTypes.Exact<{
  name: AdminTypes.Scalars['String']['input'];
  returnUrl: AdminTypes.Scalars['URL']['input'];
  test: AdminTypes.Scalars['Boolean']['input'];
  lineItems: Array<AdminTypes.AppSubscriptionLineItemInput> | AdminTypes.AppSubscriptionLineItemInput;
}>;


export type AppSubscriptionCreateMutation = { appSubscriptionCreate?: AdminTypes.Maybe<(
    Pick<AdminTypes.AppSubscriptionCreatePayload, 'confirmationUrl'>
    & { userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>>, appSubscription?: AdminTypes.Maybe<Pick<AdminTypes.AppSubscription, 'id' | 'name'>> }
  )> };

export type SettingsGetActiveSubscriptionsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type SettingsGetActiveSubscriptionsQuery = { currentAppInstallation: { activeSubscriptions: Array<(
      Pick<AdminTypes.AppSubscription, 'id' | 'name' | 'status'>
      & { lineItems: Array<{ plan: { pricingDetails: { price: Pick<AdminTypes.MoneyV2, 'amount'> } } }> }
    )> } };

export type GetActiveSubscriptionsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type GetActiveSubscriptionsQuery = { currentAppInstallation: { activeSubscriptions: Array<(
      Pick<AdminTypes.AppSubscription, 'id' | 'name' | 'status'>
      & { lineItems: Array<{ plan: { pricingDetails: { price: Pick<AdminTypes.MoneyV2, 'amount'> } } }> }
    )> } };

export type MetaobjectsEnsureDefinitionQueryVariables = AdminTypes.Exact<{
  type: AdminTypes.Scalars['String']['input'];
}>;


export type MetaobjectsEnsureDefinitionQuery = { metaobjectDefinitionByType?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'id'>> };

export type MetaobjectsCreateDefinitionMutationVariables = AdminTypes.Exact<{
  definition: AdminTypes.MetaobjectDefinitionCreateInput;
}>;


export type MetaobjectsCreateDefinitionMutation = { metaobjectDefinitionCreate?: AdminTypes.Maybe<{ metaobjectDefinition?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'id'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message'>> }> };

export type MetaobjectsListBannersQueryVariables = AdminTypes.Exact<{
  type: AdminTypes.Scalars['String']['input'];
}>;


export type MetaobjectsListBannersQuery = { metaobjects: { nodes: Array<Pick<AdminTypes.Metaobject, 'id' | 'handle'>> } };

export type MetaobjectsUpdateBannerMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  metaobject: AdminTypes.MetaobjectUpdateInput;
}>;


export type MetaobjectsUpdateBannerMutation = { metaobjectUpdate?: AdminTypes.Maybe<{ metaobject?: AdminTypes.Maybe<Pick<AdminTypes.Metaobject, 'id'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message'>> }> };

export type MetaobjectsCreateBannerMutationVariables = AdminTypes.Exact<{
  metaobject: AdminTypes.MetaobjectCreateInput;
}>;


export type MetaobjectsCreateBannerMutation = { metaobjectCreate?: AdminTypes.Maybe<{ metaobject?: AdminTypes.Maybe<Pick<AdminTypes.Metaobject, 'id'>>, userErrors: Array<Pick<AdminTypes.MetaobjectUserError, 'field' | 'message'>> }> };

interface GeneratedQueryTypes {
  "#graphql\n  query HomeGetActiveSubscriptions {\n    currentAppInstallation {\n      activeSubscriptions {\n        id\n        name\n        status\n        lineItems {\n          plan {\n            pricingDetails {\n              ... on AppRecurringPricing {\n                price {\n                  amount\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n": {return: HomeGetActiveSubscriptionsQuery, variables: HomeGetActiveSubscriptionsQueryVariables},
  "#graphql\n      query HomeEnsureDefinition($type: String!) {\n        metaobjectDefinitionByType(type: $type) {\n          id\n        }\n      }\n      ": {return: HomeEnsureDefinitionQuery, variables: HomeEnsureDefinitionQueryVariables},
  "#graphql\n      query BannerEditEnsureDefinition($type: String!) {\n        metaobjectDefinitionByType(type: $type) {\n          id\n        }\n      }\n      ": {return: BannerEditEnsureDefinitionQuery, variables: BannerEditEnsureDefinitionQueryVariables},
  "#graphql\n      query BannerEditListBanners($type: String!) { metaobjects(first: 250, type: $type) { nodes { id } } }": {return: BannerEditListBannersQuery, variables: BannerEditListBannersQueryVariables},
  "#graphql\n          query BannerEditGetProducts($first: Int!) {\n            products(first: $first) {\n              nodes {\n                id\n                title\n                handle\n                status\n                featuredImage {\n                  url\n                  altText\n                }\n                images(first: 20) {\n                  nodes {\n                    id\n                    url\n                    width\n                    height\n                  }\n                }\n              }\n            }\n          }\n        ": {return: BannerEditGetProductsQuery, variables: BannerEditGetProductsQueryVariables},
  "#graphql\n          query BannerEditGetFiles($first: Int!) {\n            files(first: $first) {\n              nodes {\n                id\n                alt\n                fileStatus\n                ... on MediaImage {\n                  image {\n                    url\n                    width\n                    height\n                  }\n                }\n                preview {\n                  image {\n                    url\n                    width\n                    height\n                  }\n                }\n              }\n            }\n          }\n        ": {return: BannerEditGetFilesQuery, variables: BannerEditGetFilesQueryVariables},
  "#graphql\n      query BannerIndexEnsureDefinition($type: String!) {\n        metaobjectDefinitionByType(type: $type) {\n          id\n        }\n      }\n      ": {return: BannerIndexEnsureDefinitionQuery, variables: BannerIndexEnsureDefinitionQueryVariables},
  "#graphql\n      query BannerIndexListBanners($type: String!) { metaobjects(first: 250, type: $type) { nodes { id } } }": {return: BannerIndexListBannersQuery, variables: BannerIndexListBannersQueryVariables},
  "#graphql\n  query CurrentInstallation {\n    currentAppInstallation {\n      activeSubscriptions {\n        id\n        name\n        status\n      }\n    }\n  }\n": {return: CurrentInstallationQuery, variables: CurrentInstallationQueryVariables},
  "#graphql\n  query SettingsGetActiveSubscriptions {\n    currentAppInstallation {\n      activeSubscriptions {\n        id\n        name\n        status\n        lineItems {\n          plan {\n            pricingDetails {\n              ... on AppRecurringPricing {\n                price {\n                  amount\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n": {return: SettingsGetActiveSubscriptionsQuery, variables: SettingsGetActiveSubscriptionsQueryVariables},
  "#graphql\n  query GetActiveSubscriptions {\n    currentAppInstallation {\n      activeSubscriptions {\n        id\n        name\n        status\n        lineItems {\n          plan {\n            pricingDetails {\n              ... on AppRecurringPricing {\n                price {\n                  amount\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n": {return: GetActiveSubscriptionsQuery, variables: GetActiveSubscriptionsQueryVariables},
  "#graphql\n      query MetaobjectsEnsureDefinition($type: String!) {\n        metaobjectDefinitionByType(type: $type) {\n          id\n        }\n      }\n      ": {return: MetaobjectsEnsureDefinitionQuery, variables: MetaobjectsEnsureDefinitionQueryVariables},
  "#graphql\n      query MetaobjectsListBanners($type: String!) { metaobjects(first: 250, type: $type) { nodes { id handle } } }": {return: MetaobjectsListBannersQuery, variables: MetaobjectsListBannersQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n      mutation HomeCreateDefinition($definition: MetaobjectDefinitionCreateInput!) {\n        metaobjectDefinitionCreate(definition: $definition) {\n          metaobjectDefinition {\n            id\n          }\n          userErrors {\n            field\n            message\n          }\n        }\n      }\n      ": {return: HomeCreateDefinitionMutation, variables: HomeCreateDefinitionMutationVariables},
  "#graphql\n      mutation BannerEditCreateDefinition($definition: MetaobjectDefinitionCreateInput!) {\n        metaobjectDefinitionCreate(definition: $definition) {\n          metaobjectDefinition {\n            id\n          }\n          userErrors {\n            field\n            message\n          }\n        }\n      }\n      ": {return: BannerEditCreateDefinitionMutation, variables: BannerEditCreateDefinitionMutationVariables},
  "#graphql\n        mutation BannerEditDeleteBanner($id: ID!) { metaobjectDelete(id: $id) { deletedId } }": {return: BannerEditDeleteBannerMutation, variables: BannerEditDeleteBannerMutationVariables},
  "#graphql\n        mutation BannerEditCreateBanner($metaobject: MetaobjectCreateInput!) {\n          metaobjectCreate(metaobject: $metaobject) {\n            metaobject {\n              id\n            }\n            userErrors {\n              field\n              message\n            }\n          }\n        }\n        ": {return: BannerEditCreateBannerMutation, variables: BannerEditCreateBannerMutationVariables},
  "#graphql\n      mutation BannerIndexCreateDefinition($definition: MetaobjectDefinitionCreateInput!) {\n        metaobjectDefinitionCreate(definition: $definition) {\n          metaobjectDefinition {\n            id\n          }\n          userErrors {\n            field\n            message\n          }\n        }\n      }\n      ": {return: BannerIndexCreateDefinitionMutation, variables: BannerIndexCreateDefinitionMutationVariables},
  "#graphql\n        mutation BannerIndexDeleteBanner($id: ID!) { metaobjectDelete(id: $id) { deletedId } }": {return: BannerIndexDeleteBannerMutation, variables: BannerIndexDeleteBannerMutationVariables},
  "#graphql\n        mutation BannerIndexCreateBanner($metaobject: MetaobjectCreateInput!) {\n          metaobjectCreate(metaobject: $metaobject) {\n            metaobject {\n              id\n            }\n            userErrors {\n              field\n              message\n            }\n          }\n        }\n        ": {return: BannerIndexCreateBannerMutation, variables: BannerIndexCreateBannerMutationVariables},
  "#graphql\n  mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $test: Boolean!, $lineItems: [AppSubscriptionLineItemInput!]!) {\n    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, lineItems: $lineItems) {\n      userErrors {\n        field\n        message\n      }\n      confirmationUrl\n      appSubscription {\n        id\n        name\n      }\n    }\n  }\n": {return: AppSubscriptionCreateMutation, variables: AppSubscriptionCreateMutationVariables},
  "#graphql\n      mutation MetaobjectsCreateDefinition($definition: MetaobjectDefinitionCreateInput!) {\n        metaobjectDefinitionCreate(definition: $definition) {\n          metaobjectDefinition {\n            id\n          }\n          userErrors {\n            field\n            message\n          }\n        }\n      }\n      ": {return: MetaobjectsCreateDefinitionMutation, variables: MetaobjectsCreateDefinitionMutationVariables},
  "#graphql\n          mutation MetaobjectsUpdateBanner($id: ID!, $metaobject: MetaobjectUpdateInput!) {\n            metaobjectUpdate(id: $id, metaobject: $metaobject) {\n              metaobject { id }\n              userErrors { field message }\n            }\n          }\n          ": {return: MetaobjectsUpdateBannerMutation, variables: MetaobjectsUpdateBannerMutationVariables},
  "#graphql\n        mutation MetaobjectsCreateBanner($metaobject: MetaobjectCreateInput!) {\n          metaobjectCreate(metaobject: $metaobject) {\n            metaobject { id }\n            userErrors { field message }\n          }\n        }\n        ": {return: MetaobjectsCreateBannerMutation, variables: MetaobjectsCreateBannerMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
