import Image from 'next/image'
import type { StorySection } from '@/content/landing-content'

const toneStyles: Record<StorySection['tone'], string> = {
  light: 'bg-[var(--surface)] text-[var(--ink)] border-black/8',
  dark: 'bg-[linear-gradient(180deg,#121212_0%,#171414_100%)] text-white border-white/8',
  accent: 'bg-[linear-gradient(180deg,#ead9c2_0%,#e4cfb2_100%)] text-[var(--ink)] border-black/8',
}

const cardStyles: Record<StorySection['tone'], string> = {
  light: 'border-black/10 bg-white text-[var(--ink)] shadow-[var(--shadow-card)]',
  dark: 'border-white/10 bg-white/6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.26)] backdrop-blur-sm',
  accent: 'border-black/10 bg-[#f6ecde] text-[var(--ink)] shadow-[0_22px_70px_rgba(72,44,24,0.12)]',
}

const asideStyles: Record<StorySection['tone'], string> = {
  light: 'border-black/10 bg-black/[0.03] text-[var(--ink)]',
  dark: 'border-white/10 bg-black/22 text-white backdrop-blur-sm',
  accent: 'border-black/10 bg-white/45 text-[var(--ink)] backdrop-blur-sm',
}

export function StorySectionView({
  section,
  reverse = false,
  children,
}: {
  section: StorySection
  reverse?: boolean
  children?: React.ReactNode
}) {
  return (
    <section id={section.id} data-story-section className={`border-b ${toneStyles[section.tone]}`}>
      <div className="mx-auto grid w-full max-w-[var(--content-max)] gap-8 px-4 py-12 sm:gap-10 sm:px-8 sm:py-16 lg:grid-cols-[0.94fr_1.06fr] lg:gap-12 lg:px-12 lg:py-18">
        <div data-story-copy className={`space-y-5 sm:space-y-6 ${reverse ? 'lg:order-2' : ''}`}>
          <div className="space-y-4">
            <p className="text-caption uppercase tracking-[0.24em] text-current/58">{section.eyebrow}</p>
            <h2 className="max-w-3xl text-balance text-display-sm font-semibold tracking-[-0.04em]">{section.title}</h2>
            <p className="max-w-2xl text-[0.98rem] leading-7 text-current/80 sm:text-body-lg sm:leading-8">{section.body}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {section.stats.map((stat) => (
              <div key={stat.label} data-story-stat className={`rounded-[22px] border p-4 ${cardStyles[section.tone]}`}>
                <p className="text-caption uppercase tracking-[0.18em] text-current/52">{stat.label}</p>
                <p className="mt-2 text-xl font-semibold">{stat.value}</p>
                <p className="mt-2 text-body-sm leading-6 text-current/72">{stat.detail}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr] lg:gap-4">
            <div data-story-focus className={`rounded-[24px] border p-5 sm:p-6 ${cardStyles[section.tone]}`}>
              <p className="text-caption uppercase tracking-[0.18em] text-current/55">Story focus</p>
              <p className="mt-3 text-body-md font-medium text-current/88">{section.summary}</p>
              <ul className="mt-5 space-y-3 text-body-md text-current/78">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <span className="mt-2 h-2 w-2 rounded-full bg-current/70" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>

            <aside data-story-aside className={`rounded-[24px] border p-5 sm:p-6 ${asideStyles[section.tone]}`}>
              <p className="text-caption uppercase tracking-[0.18em] text-current/55">{section.asideTitle}</p>
              <p className="mt-4 text-body-md leading-7 text-current/78">{section.asideBody}</p>
              <div className="mt-6 rounded-[16px] border border-dashed border-current/22 px-4 py-3 text-body-sm text-current/70">
                {section.kicker}
              </div>
            </aside>
          </div>
        </div>

        <div className={`space-y-4 ${reverse ? 'lg:order-1' : ''}`}>
          <div data-story-media-frame className="relative overflow-hidden rounded-[28px] border border-current/12 bg-black/10 shadow-[var(--shadow-card)]">
            {section.texture ? (
              <Image
                src={section.texture.src}
                alt=""
                width={section.texture.width}
                height={section.texture.height}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-multiply"
                aria-hidden
              />
            ) : null}
            <Image
              src={section.media.src}
              alt={section.media.alt}
              width={section.media.width}
              height={section.media.height}
              priority={section.media.priority}
              loading={section.media.loading}
              className="relative z-10 h-full w-full object-cover"
            />
          </div>
          {section.media.caption ? <p className="px-1 text-body-sm leading-6 text-current/60">{section.media.caption}</p> : null}
          {children}
        </div>
      </div>
    </section>
  )
}
