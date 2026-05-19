import 'server-only'

import { createMgeEverydayClient, type MgeEverydayClient } from './client'
import type {
  MgeBrand,
  MgeManufacturingType,
  MgeOrderDetail,
  MgeOrderDraftCreateInput,
  MgeOrderDraftDetail,
  MgeOrderValidateResponse,
  MgePreviewSession,
  MgeProductCode,
  MgeProductTypeSummary,
  MgeProductVariant,
} from './types'

export function createMgeEverydayResources(client: MgeEverydayClient = createMgeEverydayClient()) {
  return {
    account: {
      listBrands: () => client.get<MgeBrand[]>('/api/v1/account/brands/'),
    },
    products: {
      listTypes: () => client.get<MgeProductTypeSummary[]>('/api/v1/products/types/'),
      getType: (code: MgeProductCode) => client.get(`/api/v1/products/types/${code}/`),
      listVariants: (code: MgeProductCode, productType: MgeManufacturingType = 'VF') =>
        client.get<MgeProductVariant[]>(`/api/v1/products/types/${code}/variants/?product_type=${productType}`),
    },
    preview: {
      create: (formData: FormData) => client.post<MgePreviewSession>('/api/v1/preview/', formData),
      retrieve: (previewId: string) => client.get<MgePreviewSession>(`/api/v1/preview/${previewId}/`),
      update: (previewId: string, formData: FormData) =>
        client.put<MgePreviewSession>(`/api/v1/preview/${previewId}/`, formData),
    },
    orderDrafts: {
      create: (input: MgeOrderDraftCreateInput) =>
        client.post<MgeOrderDraftDetail>('/api/v1/order-drafts/', input),
      retrieve: (id: number) => client.get<MgeOrderDraftDetail>(`/api/v1/order-drafts/${id}/`),
      update: (id: number, input: Partial<MgeOrderDraftDetail>) =>
        client.patch<MgeOrderDraftDetail>(`/api/v1/order-drafts/${id}/`, input),
      validate: (id: number) =>
        client.post<MgeOrderValidateResponse>(`/api/v1/order-drafts/${id}/validate/`),
      submit: (id: number) => client.post<MgeOrderDetail>(`/api/v1/order-drafts/${id}/submit/`),
    },
    orders: {
      validate: (input: object) => client.post<MgeOrderValidateResponse>('/api/v1/orders/validate/', input),
      create: (input: object) => client.post<MgeOrderDetail>('/api/v1/orders/', input),
    },
  }
}

export type MgeEverydayResources = ReturnType<typeof createMgeEverydayResources>
