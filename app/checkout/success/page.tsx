import Link from 'next/link'

export const metadata = {
  title: 'Order confirmed | Dottingo',
  description: 'Your custom paint-by-numbers order was received.',
}

export default function CheckoutSuccessPage() {
  return (
    <main className="min-h-screen bg-[var(--page)] px-6 py-10 text-[var(--ink)]">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl flex-col items-center justify-center text-center">
        <p className="mb-4 rounded-full border border-black/10 bg-white/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-black/60">
          Payment received
        </p>
        <h1 className="font-display text-5xl leading-tight md:text-6xl">
          Your kit is on its way to production.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-black/65 md:text-lg">
          Thanks for ordering from Dottingo. We have received your checkout
          and will continue preparing your personalized paint-by-numbers kit.
        </p>
        <Link
          href="/"
          className="mt-8 rounded-full border border-black/15 bg-white/80 px-6 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-white"
        >
          Back to preview
        </Link>
      </section>
    </main>
  )
}
