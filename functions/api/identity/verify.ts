import { verifyMagicLinkRequest, type IdentityEnv } from '../../../lib/identity/edge'

type PagesContext = {
  request: Request
  env: IdentityEnv
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return verifyMagicLinkRequest(context.request, context.env)
}
