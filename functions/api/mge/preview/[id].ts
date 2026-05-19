import { handleMgeBffRequest, type Env } from '../../../../lib/mgeveryday/bff-handler'

type PagesContext = {
  request: Request
  env: Env
  params: { id: string }
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleMgeBffRequest(context.request, context.env)
}
