import { createIdentityProjectPreview, type IdentityEnv } from '../../../../../lib/identity/edge'

type PagesContext = {
  request: Request
  env: IdentityEnv
  params: {
    source_group_id?: string
  }
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return createIdentityProjectPreview(context.request, context.env, context.params.source_group_id ?? '')
}
