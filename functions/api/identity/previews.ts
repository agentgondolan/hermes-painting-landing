import { getIdentityPreviews, type IdentityEnv } from '../../../lib/identity/edge'

type PagesContext = {
  request: Request
  env: IdentityEnv
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return getIdentityPreviews(context.request, context.env)
}
