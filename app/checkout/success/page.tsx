import { CheckoutSuccessStatus } from '@/components/checkout/checkout-success-status'

export const metadata = {
  title: 'Order confirmed | Dottingo',
  description: 'Your custom paint-by-numbers order was received.',
}

export default function CheckoutSuccessPage() {
  return <CheckoutSuccessStatus />
}
