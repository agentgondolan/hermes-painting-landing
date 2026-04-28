import { StorySection } from '@/content/landing-content'

const toneStyles: Record<StorySection['tone'], string> = {
  light: 'bg-[var(--surface)] text-[var(--ink)]',
  dark: 'bg-[var(--ink)] text-white',
  accent: 'bg-[var(--accent-soft)] text-[var(--ink)]',
}

export function SectionShell({ section }: { section: StorySection }) {
  return (
    <section
      id={section.id}
      className={`border-b border-black/8 ${toneStyles[section.tone]}`}
    >
      <div className="mx-auto grid min-h-[70svh] w-full max-w-[var(--content-max)] gap-10 px-5 py-18 sm:px-8 sm:py-24 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16 lg:px-12 lg:py-32">
        <div className="space-y-6">
          <p className="text-caption text-current/70">{section.eyebrow}</p>
          <h2 className="max-w-3xl text-balance text-display-sm font-semibold tracking-[-0.04em]">
            {section.title}
          </h2>
          <p className="max-w-2xl text-body-lg text-current/78">{section.body}</p>
        </div>

        <div className="flex flex-col justify-between gap-8 rounded-[var(--radius-lg)] border border-current/12 bg-white/6 p-6 shadow-[var(--shadow-card)] backdrop-blur-sm sm:p-8">
          <div className="space-y-4">
            <p className="text-caption text-current/55">Placeholder system</p>
            <ul className="space-y-3 text-body-md text-current/80">
              {section.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 rounded-full bg-current/70" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[calc(var(--radius-lg)-8px)] border border-dashed border-current/20 p-5 text-body-sm text-current/70">
            {section.kicker}
          </div>
        </div>
      </div>
    </section>
  )
}
