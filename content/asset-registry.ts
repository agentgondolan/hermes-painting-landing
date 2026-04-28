export type AssetKind = 'image' | 'texture'
export type AssetLoading = 'eager' | 'lazy'

export interface LocalAsset {
  src: string
  alt: string
  width: number
  height: number
  kind: AssetKind
  loading: AssetLoading
  priority?: boolean
  caption?: string
}

export const assetRoots = {
  images: '/images/landing',
  textures: '/textures',
} as const

export const assetLoadingConventions = {
  hero: 'Above-the-fold imagery should be eager with priority enabled.',
  narrative: 'In-story imagery defaults to lazy loading to preserve initial render speed.',
  textures: 'Decorative textures stay local, lightweight, and optional for reduced-motion phases.',
  naming:
    'Use section- or stage-based filenames such as stage-original.svg or section-kit.svg to keep the story map obvious.',
} as const

export const landingAssets = {
  stages: {
    original: {
      src: `${assetRoots.images}/stage-original.svg`,
      alt: 'Placeholder portrait card representing the uploaded reference photo.',
      width: 960,
      height: 1200,
      kind: 'image',
      loading: 'eager',
      priority: true,
      caption: 'Reference memory selected for conversion.',
    },
    palette: {
      src: `${assetRoots.images}/stage-palette.svg`,
      alt: 'Abstract palette reduction artwork showing grouped paint regions.',
      width: 960,
      height: 1200,
      kind: 'image',
      loading: 'lazy',
      caption: 'Palette simplification with grouped tones.',
    },
    canvas: {
      src: `${assetRoots.images}/stage-canvas.svg`,
      alt: 'Numbered canvas placeholder with grid-style paint regions.',
      width: 960,
      height: 1200,
      kind: 'image',
      loading: 'lazy',
      caption: 'Mapped canvas structure ready for painting.',
    },
    finished: {
      src: `${assetRoots.images}/stage-finished.svg`,
      alt: 'Finished framed artwork placeholder with warm lighting.',
      width: 960,
      height: 1200,
      kind: 'image',
      loading: 'lazy',
      caption: 'Completed artwork staged as the emotional payoff.',
    },
  },
  sections: {
    kit: {
      src: `${assetRoots.images}/section-kit.svg`,
      alt: 'Paint-by-number kit placeholder showing canvas, paint pots, and brushes.',
      width: 1400,
      height: 980,
      kind: 'image',
      loading: 'lazy',
      caption: 'Premium kit contents arranged for a future exploded view.',
    },
    progression: {
      src: `${assetRoots.images}/section-progress.svg`,
      alt: 'Sequential painting progress placeholder from outline to completed art.',
      width: 1400,
      height: 980,
      kind: 'image',
      loading: 'lazy',
      caption: 'The painting ritual shown as a calm progress story.',
    },
  },
  textures: {
    paper: {
      src: `${assetRoots.textures}/paper-grain.svg`,
      alt: 'Soft paper grain texture overlay.',
      width: 1200,
      height: 1200,
      kind: 'texture',
      loading: 'lazy',
    },
    grid: {
      src: `${assetRoots.textures}/canvas-grid.svg`,
      alt: 'Canvas grid texture overlay.',
      width: 1200,
      height: 1200,
      kind: 'texture',
      loading: 'lazy',
    },
  },
} as const
