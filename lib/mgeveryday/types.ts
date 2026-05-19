export type MgeProductCode = 'PBN' | 'DBN' | 'DOT' | 'PHT' | 'PIX' | 'ACC'
export type MgeManufacturingType = 'VF' | 'SKLAD'

export interface MgeBrand {
  brand_id: number
  brand_email: string
  brand_name: string
  brand_short_code: string
  language: string
  carrier_company_name: string | null
  preferred_currency: string | null
  access_role: string
  is_default: boolean
}

export interface MgeProductTypeSummary {
  code: MgeProductCode
  name: string
  description: string
  sku_template: string
  sku_example: string
  detail_url: string
}

export interface MgeProductVariant {
  id: number
  code: string
  product: MgeProductCode
  product_type: MgeManufacturingType
  size: number
  size_display: string
  frame: string | null
  manufacturing: string | null
  colors_type: string | null
  diamond_type: string | null
  PIX_tool: string | null
}

export interface MgePreviewSession {
  id?: string
  preview_id?: string
  status?: string
  options?: MgePreviewOption[]
  [key: string]: unknown
}

export interface MgePreviewOption {
  preview_option_id?: string | number
  orderable?: boolean
  order_contract_version?: string | number
  order_contract?: unknown
  non_orderable_reason?: string | null
  [key: string]: unknown
}

export interface MgeOrderDraftCreateInput {
  brand_id: number
  reference_id?: string
  carrier_company_name?: string
  notes?: string
}

export interface MgeOrderDraftDetail {
  id: number
  brand_id: number
  status: string
  reference_id: string | null
  line_items: unknown[]
  validation_snapshot?: unknown
  submitted_order_id?: string | number | null
  [key: string]: unknown
}

export interface MgeOrderValidateResponse {
  valid: boolean
  line_items?: unknown[]
  errors?: unknown[]
  [key: string]: unknown
}

export interface MgeOrderDetail {
  id: string | number
  reference_id?: string | null
  status?: string
  brand_id?: number
  line_items?: unknown[]
  [key: string]: unknown
}
