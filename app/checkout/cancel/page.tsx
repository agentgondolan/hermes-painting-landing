import Link from 'next/link'

export const metadata = {
  title: 'Checkout cancelled | Dottingo',
  description: 'Return to your custom paint-by-numbers preview.',
}

export default function CheckoutCancelPage() {
  return (
    <main className="min-h-screen bg-[var(--page)] px-6 py-10 text-[var(--ink)]">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl flex-col items-center justify-center text-center">
        <p className="mb-4 rounded-full border border-black/10 bg-white/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-black/60">
          Checkout paused
        </p>
        <h1 className="font-display text-5xl leading-tight md:text-6xl">
          No payment was taken.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-black/65 md:text-lg">
          Your preview is still waiting. Go back when you are ready to choose a
          kit size and complete the order.
        </p>
        <Link
          href="/"
          className="mt-8 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/85"
        >
          Back to preview
        </Link>
      </section>
    </main>
  )
}
