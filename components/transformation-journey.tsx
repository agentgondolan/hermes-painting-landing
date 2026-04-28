import Image from 'next/image'
import { transformationStages } from '@/content/landing-content'

export function TransformationJourney() {
  return (
    <section
      id="story-journey"
      data-journey-root
      className="border-b border-black/8 bg-[linear-gradient(180deg,#fbf6ee_0%,#f5eee3_100%)] text-[var(--ink)]"
    >
      <div className="mx-auto max-w-[var(--content-max)] px-4 py-12 sm:px-8 sm:py-14 lg:px-12 lg:py-18">
        <div className="max-w-3xl space-y-4">
          <p className="text-caption uppercase tracking-[0.24em] text-[var(--ink)]/52">Journey — one controlled transformation</p>
          <h2 className="text-balance text-display-sm font-semibold tracking-[-0.05em]">
            One sticky sequence. Three simple shifts. A photo becomes a paintable memory.
          </h2>
          <p className="max-w-2xl text-[1rem] leading-7 text-[var(--ink)]/72 sm:text-body-lg sm:leading-8">
            Instead of scattering the process across multiple sections, keep the product story pinned in view. The visual stays present while the copy moves from emotional input to palette reduction to numbered canvas clarity.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[0.94fr_1.06fr] lg:gap-10">
          <div className="lg:pr-2">
            <div className="journey-sticky top-4 space-y-4 rounded-[30px] border border-black/8 bg-white/78 p-3 shadow-[0_32px_90px_rgba(27,20,13,0.12)] backdrop-blur-sm sm:p-4 lg:top-6 lg:p-5">
              <div className="rounded-[24px] border border-black/8 bg-[radial-gradient(circle_at_top,rgba(252,233,206,0.9),transparent_28%),linear-gradient(180deg,#fff9f1_0%,#f0e4d3_100%)] p-3 sm:p-4">
                <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] bg-[#f6ead9]">
                  {transformationStages.map((stage, index) => (
                    <div
                      key={stage.id}
                      data-journey-visual
                      data-stage-index={index}
                      className={`absolute inset-0 transition-opacity duration-500 ${index === 0 ? 'opacity-100' : 'opacity-0'}`}
                    >
                      <Image
                        src={stage.asset.src}
                        alt={stage.asset.alt}
                        width={stage.asset.width}
                        height={stage.asset.height}
                        priority={index === 0}
                        loading={index === 0 ? 'eager' : stage.asset.loading}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent_0%,rgba(10,10,10,0.58)_100%)] px-4 pb-4 pt-12 text-white sm:px-5 sm:pb-5">
                        <p className="text-caption uppercase tracking-[0.22em] text-white/52">Step 0{stage.step}</p>
                        <p className="mt-2 text-lg font-medium sm:text-xl">{stage.label}</p>
                        <p className="mt-2 max-w-sm text-body-sm leading-6 text-white/76">{stage.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-black/8 bg-[var(--ink)] px-4 py-4 text-white sm:px-5 sm:py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-caption uppercase tracking-[0.18em] text-white/44">Narrative progress</p>
                    <p data-journey-label className="mt-1 text-body-md font-medium text-white/88">
                      {transformationStages[0].focusLabel}
                    </p>
                  </div>
                  <p data-journey-counter className="text-caption uppercase tracking-[0.18em] text-white/52">
                    01 / 04
                  </p>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div data-journey-progress className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: '25%' }} />
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2">
                  {transformationStages.map((stage, index) => (
                    <div
                      key={stage.id}
                      data-journey-dot
                      data-stage-index={index}
                      className={`rounded-full border px-2 py-2 text-center text-[10px] uppercase tracking-[0.16em] transition sm:text-[11px] ${index === 0 ? 'border-white/32 bg-white/12 text-white' : 'border-white/10 text-white/45'}`}
                    >
                      {stage.label.split(' ')[0]}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-5">
            {transformationStages.map((stage, index) => (
              <article
                key={stage.id}
                data-journey-step
                data-stage-index={index}
                className={`rounded-[28px] border p-5 transition-colors sm:p-6 ${index === 0 ? 'border-[var(--ink)]/12 bg-white shadow-[0_22px_70px_rgba(17,17,17,0.08)]' : 'border-black/8 bg-white/58'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-caption uppercase tracking-[0.2em] text-[var(--ink)]/48">Step 0{stage.step}</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{stage.headline}</h3>
                  </div>
                  <div className="hidden rounded-full border border-black/8 px-3 py-2 text-caption uppercase tracking-[0.16em] text-[var(--ink)]/54 sm:inline-flex">
                    {stage.focusLabel}
                  </div>
                </div>

                <p className="mt-4 max-w-2xl text-body-md leading-7 text-[var(--ink)]/72">{stage.description}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {stage.palette.map((swatch) => (
                    <span key={swatch} className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-[var(--page)] px-3 py-2 text-body-sm text-[var(--ink)]/68">
                      <span className="h-3 w-3 rounded-full border border-black/8" style={{ backgroundColor: swatch }} />
                      {swatch}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
