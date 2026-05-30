import { requestMagicLink, type IdentityEnv } from '../../../lib/identity/edge'

type PagesContext = {
  request: Request
  env: IdentityEnv
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return requestMagicLink(context.request, context.env)
}
