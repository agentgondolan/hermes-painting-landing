'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function ScrollStory() {
  useGSAP(() => {
    const root = document.getElementById('story-root')
    if (!root) {
      return
    }

    const heroPanel = root.querySelector<HTMLElement>('[data-hero-panel]')
    const heroCopy = root.querySelector<HTMLElement>('[data-hero-copy]')
    const heroProofs = gsap.utils.toArray<HTMLElement>('[data-hero-proof]', root)
    const journeySteps = gsap.utils.toArray<HTMLElement>('[data-journey-step]', root)
    const journeyVisuals = gsap.utils.toArray<HTMLElement>('[data-journey-visual]', root)
    const journeyDots = gsap.utils.toArray<HTMLElement>('[data-journey-dot]', root)
    const progressBar = root.querySelector<HTMLElement>('[data-journey-progress]')
    const journeyLabel = root.querySelector<HTMLElement>('[data-journey-label]')
    const journeyCounter = root.querySelector<HTMLElement>('[data-journey-counter]')
    const climaxCopy = root.querySelector<HTMLElement>('[data-climax-copy]')
    const climaxMedia = root.querySelector<HTMLElement>('[data-climax-media]')
    const reducedTargets = gsap.utils.toArray<HTMLElement>(
      [
        '[data-hero-panel]',
        '[data-hero-copy]',
        '[data-hero-proof]',
        '[data-journey-step]',
        '[data-climax-copy]',
        '[data-climax-media]',
      ].join(','),
      root,
    )

    const journeyLabels = ['Emotional anchor', 'Color logic', 'Guided structure', 'Display-worthy result']

    const setJourneyStage = (index: number) => {
      journeyVisuals.forEach((visual, visualIndex) => {
        gsap.to(visual, {
          autoAlpha: visualIndex === index ? 1 : 0,
          duration: 0.35,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      })

      journeyDots.forEach((dot, dotIndex) => {
        const active = dotIndex === index
        dot.classList.toggle('border-white/32', active)
        dot.classList.toggle('bg-white/12', active)
        dot.classList.toggle('text-white', active)
        dot.classList.toggle('border-white/10', !active)
        dot.classList.toggle('text-white/45', !active)
      })

      if (progressBar) {
        progressBar.style.width = `${((index + 1) / journeyVisuals.length) * 100}%`
      }

      if (journeyLabel) {
        journeyLabel.textContent = journeyLabels[index] ?? journeyLabels[0]
      }

      if (journeyCounter) {
        journeyCounter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(journeyVisuals.length).padStart(2, '0')}`
      }
    }

    ScrollTrigger.matchMedia({
      '(prefers-reduced-motion: reduce)': () => {
        root.dataset.motionMode = 'reduced'
        gsap.set(reducedTargets, { clearProps: 'all' })
        setJourneyStage(0)
      },

      '(prefers-reduced-motion: no-preference)': () => {
        root.dataset.motionMode = 'standard'

        if (heroCopy) {
          gsap.fromTo(heroCopy, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' })
        }

        if (heroPanel) {
          gsap.fromTo(
            heroPanel,
            { autoAlpha: 0.84, y: 20, scale: 0.992 },
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 1.1,
              ease: 'power2.out',
            },
          )

          gsap.to(heroPanel, {
            yPercent: -2.5,
            ease: 'none',
            scrollTrigger: {
              trigger: heroPanel,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 1,
            },
          })
        }

        if (heroProofs.length > 0) {
          gsap.fromTo(
            heroProofs,
            { autoAlpha: 0, y: 16 },
            {
              autoAlpha: 1,
              y: 0,
              stagger: 0.08,
              duration: 0.55,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: heroProofs[0],
                start: 'top 88%',
                once: true,
              },
            },
          )
        }

        journeySteps.forEach((step, index) => {
          gsap.fromTo(
            step,
            { autoAlpha: 0, y: 28 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.55,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: step,
                start: 'top 82%',
                once: true,
              },
            },
          )

          ScrollTrigger.create({
            trigger: step,
            start: 'top center',
            end: 'bottom center',
            onEnter: () => setJourneyStage(index),
            onEnterBack: () => setJourneyStage(index),
          })
        })

        if (climaxCopy && climaxMedia) {
          const timeline = gsap.timeline({
            scrollTrigger: {
              trigger: climaxMedia,
              start: 'top 78%',
              once: true,
            },
          })

          timeline
            .fromTo(climaxMedia, { autoAlpha: 0, y: 30, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.75, ease: 'power2.out' })
            .fromTo(climaxCopy, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 0.08)
        }
      },
    })

    ScrollTrigger.refresh()
  })

  return null
}
