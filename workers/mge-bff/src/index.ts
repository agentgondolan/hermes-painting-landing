/// <reference types="@cloudflare/workers-types" />

import { handleMgeBffRequest, type Env } from '../../../lib/mgeveryday/bff-handler'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleMgeBffRequest(request, env)
  },
} satisfies ExportedHandler<Env>
