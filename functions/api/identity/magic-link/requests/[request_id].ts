import { getMagicLinkRequestStatus, type IdentityEnv } from '../../../../../lib/identity/edge'

type PagesContext = {
  request: Request
  env: IdentityEnv
  params: {
    request_id?: string
  }
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return getMagicLinkRequestStatus(context.request, context.env, context.params.request_id || '')
}
