import { handleStripeWebhook, type StripeEnv } from '../../../lib/stripe/edge'

type PagesContext = {
  request: Request
  env: StripeEnv
}

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleStripeWebhook(context.request, context.env)
}
