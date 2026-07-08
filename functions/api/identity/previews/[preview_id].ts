import { deleteIdentityPreview, type IdentityEnv } from '../../../../lib/identity/edge'

type PagesContext = {
  request: Request
  env: IdentityEnv
  params: {
    preview_id?: string
  }
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return deleteIdentityPreview(context.request, context.env, context.params.preview_id ?? '')
}
