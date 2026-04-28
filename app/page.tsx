import Image from 'next/image'
import { HeroProductScene } from '@/components/hero-product-scene'
import { ScrollStory } from '@/components/scroll-story'
import { TransformationJourney } from '@/components/transformation-journey'
import { conversionOptions, productKitItems, transformationStages } from '@/content/landing-content'

export default function Home() {
  return (
    <main id="story-root" className="bg-[var(--page)] text-[var(--ink)]">
      <ScrollStory />

      <section
        data-hero-section
        className="relative overflow-hidden border-b border-black/8 bg-[radial-gradient(circle_at_18%_0%,rgba(255,244,230,0.94),rgba(255,244,230,0)_25%),radial-gradient(circle_at_82%_15%,rgba(219,187,147,0.34),rgba(219,187,147,0)_22%),linear-gradient(180deg,#faf5ee_0%,#efe3d3_56%,#e7d8c5_100%)] text-[var(--ink)]"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.88),transparent_58%)]" />

        <div className="relative mx-auto max-w-[var(--content-max)] px-4 py-5 sm:px-8 sm:py-6 lg:px-12 lg:py-8">
          <header className="flex flex-wrap items-center justify-between gap-3 text-caption uppercase tracking-[0.22em] text-[var(--ink)]/42">
            <span>Makeyourcraft / premium paint-by-number</span>
            <span>Hero reset — real 3D product view</span>
          </header>

          <div className="grid gap-8 py-8 sm:gap-10 sm:py-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-12 lg:py-16">
            <div className="order-2 space-y-6 lg:order-1 lg:pr-2">
              <div data-hero-copy className="space-y-5">
                <p className="text-caption uppercase tracking-[0.24em] text-[var(--ink)]/44">A believable product object first</p>
                <h1 className="max-w-[11ch] text-balance font-[var(--font-display)] text-[clamp(2.9rem,8vw,5.4rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-[#17110c]">
                  Upload the photo. Process the artwork. See it land on the real canvas.
                </h1>
                <p className="max-w-lg text-[1rem] leading-7 text-[var(--ink)]/72 sm:text-body-lg sm:leading-8">
                  The hero now behaves like a premium product viewer with the first live upload loop built in. Start with the real object, run the reserved async processing step, and preview the result on the physical canvas.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <a
                  href="#conversion-block"
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--ink)] px-6 text-body-md font-medium text-white transition hover:bg-black"
                >
                  Start your custom kit
                </a>
                <a href="#story-journey" className="text-body-sm font-medium text-[var(--ink)]/62 transition hover:text-[var(--ink)]">
                  See the transformation story
                </a>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  'Real 3D canvas proportions with studio lighting',
                  'Wooden easel with grounded contact shadows',
                  'Live upload preview mapped onto the canvas',
                ].map((item) => (
                  <div
                    key={item}
                    data-hero-proof
                    className="rounded-[18px] border border-black/8 bg-white/56 px-4 py-3 text-body-sm leading-6 text-[var(--ink)]/72 shadow-[0_16px_32px_rgba(74,47,24,0.05)] backdrop-blur-sm"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div data-hero-panel className="order-1 lg:order-2 lg:-mr-4">
              <HeroProductScene />
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/8 bg-[var(--page)]">
        <div className="mx-auto max-w-[var(--content-max)] px-4 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-14">
          <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
            <div className="max-w-2xl space-y-3">
              <p className="text-caption uppercase tracking-[0.22em] text-[var(--ink)]/52">Narrative structure</p>
              <h2 className="text-display-sm font-semibold tracking-[-0.04em]">Fewer sections. Stronger beats. Clear pacing from desire to proof to payoff to action.</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {['Hook', 'Journey', 'Climax', 'Resolution'].map((beat, index) => (
                <article key={beat} className="rounded-[22px] border border-black/8 bg-white p-4 shadow-[var(--shadow-card)]">
                  <p className="text-caption uppercase tracking-[0.18em] text-[var(--ink)]/46">0{index + 1}</p>
                  <p className="mt-2 text-body-md font-medium">{beat}</p>
                  <p className="mt-2 text-body-sm leading-6 text-[var(--ink)]/68">
                    {
                      [
                        'Premium entrance with instant product comprehension.',
                        'Sticky process transformation that stays readable on mobile.',
                        'Finished-art reveal that lands on emotion, not specs.',
                        'CTA block that asks for the order instead of more scrolling.',
                      ][index]
                    }
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <TransformationJourney />

      <section id="climax" data-climax-section className="relative overflow-hidden border-b border-black/8 bg-[linear-gradient(180deg,#191614_0%,#0e0d0d_100%)] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(255,214,164,0.2),transparent_26%),radial-gradient(circle_at_24%_80%,rgba(255,255,255,0.06),transparent_20%)]" />
        <div className="relative mx-auto max-w-[var(--content-max)] px-4 py-12 sm:px-8 sm:py-14 lg:px-12 lg:py-18">
          <div className="grid gap-8 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:gap-12">
            <div data-climax-media className="rounded-[30px] border border-white/10 bg-white/4 p-3 shadow-[0_32px_120px_rgba(0,0,0,0.38)] sm:p-4">
              <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#211d1b]">
                <Image
                  src={transformationStages[3].asset.src}
                  alt={transformationStages[3].asset.alt}
                  width={transformationStages[3].asset.width}
                  height={transformationStages[3].asset.height}
                  className="aspect-[5/4] w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent_0%,rgba(10,10,10,0.72)_100%)] px-5 pb-5 pt-12">
                  <p className="text-caption uppercase tracking-[0.2em] text-white/44">Climax — the reveal</p>
                  <p className="mt-2 max-w-lg text-xl font-medium text-white/90 sm:text-2xl">
                    The product stops being a “custom kit” and starts feeling like a finished keepsake someone wants to display.
                  </p>
                </div>
              </div>
            </div>

            <div data-climax-copy className="space-y-5">
              <div className="space-y-3">
                <p className="text-caption uppercase tracking-[0.24em] text-white/48">Painted payoff</p>
                <h2 className="text-balance text-display-sm font-semibold tracking-[-0.05em]">
                  End on the framed result, because that is what customers imagine in their home.
                </h2>
                <p className="max-w-xl text-body-lg leading-8 text-white/74">
                  The process earns trust, but the reveal earns desire. This beat turns progress into something giftable, personal, and visibly premium.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {productKitItems.slice(0, 3).map((item) => (
                  <article key={item.id} className="rounded-[22px] border border-white/10 bg-white/6 p-4 backdrop-blur-sm">
                    <p className="text-caption uppercase tracking-[0.18em] text-white/44">{item.name}</p>
                    <p className="mt-2 text-body-md font-medium text-white/88">{item.detail}</p>
                    <p className="mt-2 text-body-sm leading-6 text-white/64">{item.note}</p>
                  </article>
                ))}
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/18 p-5 text-body-md leading-7 text-white/74">
                The page now builds toward a single emotional handoff: “I can see the final artwork already, so uploading my photo feels like the obvious next move.”
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="conversion-block" data-resolution-section className="border-b border-black/8 bg-[linear-gradient(180deg,#f3e7d6_0%,#eadbc4_100%)] text-[var(--ink)]">
        <div className="mx-auto max-w-[var(--content-max)] px-4 py-12 sm:px-8 sm:py-14 lg:px-12 lg:py-18">
          <div className="grid gap-8 rounded-[32px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.52))] p-6 shadow-[0_32px_90px_rgba(77,54,26,0.12)] sm:p-8 lg:grid-cols-[0.94fr_1.06fr] lg:items-end lg:p-10">
            <div className="space-y-4">
              <p className="text-caption uppercase tracking-[0.22em] text-[var(--ink)]/48">Resolution — convert the emotion</p>
              <h2 className="max-w-2xl text-display-sm font-semibold tracking-[-0.05em]">
                Ask for the upload while the finished piece is still in the visitor’s head.
              </h2>
              <p className="max-w-xl text-body-lg leading-8 text-[var(--ink)]/74">
                No extra detours. No feature dump. Just a premium final block with a primary next step and a softer fallback for anyone who needs one more layer of confidence.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href="#story-root"
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--ink)] px-6 text-body-md font-medium text-white transition hover:bg-black"
                >
                  Upload your photo
                </a>
                <a
                  href="#story-journey"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-black/12 px-6 text-body-md font-medium text-[var(--ink)] transition hover:border-black/24 hover:bg-white/55"
                >
                  Replay the transformation
                </a>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {conversionOptions.map((option) => (
                <article key={option.id} className="rounded-[22px] border border-black/8 bg-white/68 p-4">
                  <p className="text-caption uppercase tracking-[0.18em] text-[var(--ink)]/46">{option.label}</p>
                  <p className="mt-2 text-body-md font-medium text-[var(--ink)]/90">{option.title}</p>
                  <p className="mt-2 text-body-sm leading-6 text-[var(--ink)]/68">{option.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-[var(--ink)] text-white">
        <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-4 px-4 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12 lg:py-10">
          <p className="max-w-2xl text-body-sm text-white/56">
            Rebuilt as a controlled scroll movie: a stronger hook, one sticky transformation, a clear artwork reveal, and a tighter conversion close.
          </p>
          <a
            href="#story-root"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 px-5 text-body-sm font-medium text-white transition hover:border-white/25 hover:bg-white/8"
          >
            Back to top
          </a>
        </div>
      </footer>
    </main>
  )
}
