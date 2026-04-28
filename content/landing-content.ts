import { landingAssets, type LocalAsset } from '@/content/asset-registry'

export type SectionTone = 'light' | 'dark' | 'accent'

export interface StoryMetric {
  label: string
  value: string
  detail: string
}

export interface TransformationStage {
  id: string
  step: number
  label: string
  headline: string
  description: string
  palette: string[]
  focusLabel: string
  asset: LocalAsset
}

export interface StorySection {
  id: string
  order: number
  eyebrow: string
  title: string
  body: string
  summary: string
  bullets: string[]
  tone: SectionTone
  kicker: string
  media: LocalAsset
  texture?: LocalAsset
  stats: StoryMetric[]
  asideTitle: string
  asideBody: string
}

export interface ProductKitItem {
  id: string
  name: string
  detail: string
  note: string
}

export interface ConversionOption {
  id: string
  label: string
  title: string
  detail: string
}

export const heroContent = {
  eyebrow: 'Custom paint-by-number kits',
  title: 'A personal photo, turned into a paint-by-number kit worth gifting and framing.',
  body:
    'Upload one image. We simplify the palette, map the canvas, and deliver a guided set that feels premium before the first brushstroke.',
  primaryCta: 'Start your custom kit',
  secondaryCta: 'See how it works',
  proofPoints: ['Made from your photo', 'Beginner-friendly numbered canvas', 'Gift-worthy final presentation'],
} as const

export const transformationStages: TransformationStage[] = [
  {
    id: 'original',
    step: 1,
    label: 'Reference image',
    headline: 'Start with a photo that already means something.',
    description:
      'A portrait, pet, honeymoon view, or family scene becomes the emotional anchor for the finished piece.',
    palette: ['#E8D4BF', '#D2A27A', '#80543B', '#2D2C2A'],
    focusLabel: 'Emotional anchor',
    asset: landingAssets.stages.original,
  },
  {
    id: 'palette',
    step: 2,
    label: 'Palette simplification',
    headline: 'Reduce the image into painterly, makeable color blocks.',
    description:
      'Tone clusters become a manageable palette so the project feels polished without becoming intimidating.',
    palette: ['#F2DEC7', '#E0B87F', '#C48658', '#63463C'],
    focusLabel: 'Color logic',
    asset: landingAssets.stages.palette,
  },
  {
    id: 'canvas',
    step: 3,
    label: 'Canvas mapping',
    headline: 'Map every region into a clear numbered path.',
    description:
      'Contours, paint identifiers, and readable contrast guide the user from blank canvas to visible progress.',
    palette: ['#F4E7D4', '#DAB48B', '#A96F51', '#1E1E1E'],
    focusLabel: 'Guided structure',
    asset: landingAssets.stages.canvas,
  },
  {
    id: 'finished',
    step: 4,
    label: 'Finished artwork',
    headline: 'End with a framed result that feels personal, not mass-produced.',
    description:
      'The payoff is a memory reinterpreted by hand and finished like a display piece.',
    palette: ['#FBF3E7', '#D8AB74', '#9E5E4E', '#191919'],
    focusLabel: 'Display-worthy result',
    asset: landingAssets.stages.finished,
  },
]

export const productKitItems: ProductKitItem[] = [
  {
    id: 'canvas',
    name: 'Custom numbered canvas',
    detail: 'High-contrast layout on premium stock, prepared from the uploaded photo.',
    note: 'Easy to read even for first-time painters.',
  },
  {
    id: 'paints',
    name: 'Tone-matched acrylic paints',
    detail: 'A simplified palette matched to the artwork so the process stays calm and coherent.',
    note: 'Balanced for painterly warmth instead of harsh digital color.',
  },
  {
    id: 'brushes',
    name: 'Brush set for the full session',
    detail: 'Detail, fill, and finishing brushes included for smoother progress.',
    note: 'Sized for both beginners and careful touch-ups.',
  },
  {
    id: 'packaging',
    name: 'Gift-ready presentation',
    detail: 'Clean packaging that supports a premium unboxing and display-first feel.',
    note: 'Built to carry into future gifting bundles and seasonal offers.',
  },
]

export const storySections: StorySection[] = [
  {
    id: 'palette-simplification',
    order: 1,
    eyebrow: '01 — Clear and paintable',
    title: 'Your photo is edited into a calmer palette and a cleaner numbered layout.',
    body:
      'Instead of throwing customers into complexity, the system simplifies the image first. That makes the custom result look polished while still feeling easy to start.',
    summary: 'The product removes intimidation before the painting session begins.',
    bullets: ['Warm, reduced palette', 'Readable numbered regions', 'Early progress built into the layout'],
    tone: 'light',
    kicker: 'Custom art should feel approachable at first glance.',
    media: landingAssets.stages.canvas,
    texture: landingAssets.textures.paper,
    stats: [
      { label: 'Palette lanes', value: '4', detail: 'A tighter range keeps the piece painterly and manageable.' },
      { label: 'Difficulty feel', value: 'Low-friction', detail: 'The next step stays obvious for beginners.' },
      { label: 'First impression', value: 'Clean', detail: 'Customers see a guided process, not a technical template.' },
    ],
    asideTitle: 'Why this matters',
    asideBody:
      'This is the trust-building beat. It explains why a personal photo can become a custom kit without looking messy, generic, or overwhelming.',
  },
  {
    id: 'kit-payoff',
    order: 2,
    eyebrow: '02 — What arrives',
    title: 'The box has to sell the experience before a single paint pot is opened.',
    body:
      'This section behaves like merchandising, not storytelling filler. Show the tactile value clearly: custom canvas, matched paints, reliable tools, and presentation that feels ready to give.',
    summary: 'Visitors should understand the product as a premium kit, not just a nice idea.',
    bullets: ['Canvas prepared from your image', 'Paints matched to the final artwork', 'Brushes and packaging that feel curated'],
    tone: 'dark',
    kicker: 'A storefront beat with real product tension.',
    media: landingAssets.sections.kit,
    texture: landingAssets.textures.grid,
    stats: [
      { label: 'Kit items', value: '4', detail: 'Everything needed to start right away.' },
      { label: 'Merchandising role', value: 'Primary', detail: 'This is where price and value become tangible.' },
      { label: 'Gift appeal', value: 'High', detail: 'The presentation supports birthdays, anniversaries, and keepsakes.' },
    ],
    asideTitle: 'What it solves',
    asideBody:
      'People do not buy abstract process diagrams. They buy an object, a ritual, and a result. This beat makes the object feel real enough to order.',
  },
  {
    id: 'painting-progression',
    order: 3,
    eyebrow: '03 — Display-worthy payoff',
    title: 'The finished piece should feel like a memory you made by hand and still want on the wall.',
    body:
      'The painting journey matters, but the close matters more. The page should land on the emotional payoff: a meaningful photo turned into a framed keepsake with a clear reason to exist.',
    summary: 'The ritual is enjoyable, and the final piece earns permanent display space.',
    bullets: ['Visible progress through the session', 'Personal emotional anchor from the original image', 'Framed result with real home or gifting value'],
    tone: 'accent',
    kicker: 'A better ending than “project completed.”',
    media: landingAssets.sections.progression,
    texture: landingAssets.textures.paper,
    stats: [
      { label: 'Outcome', value: 'Framed keepsake', detail: 'The result feels personal, not mass-produced.' },
      { label: 'Session feel', value: 'Calm', detail: 'The process stays meditative instead of stressful.' },
      { label: 'Why it converts', value: 'Emotional', detail: 'Customers can picture the finished memory in their home.' },
    ],
    asideTitle: 'Why customers care',
    asideBody:
      'This is the page’s emotional close. It turns the product from a custom craft kit into a personal object people can imagine gifting, displaying, and talking about.',
  },
]

export const conversionOptions: ConversionOption[] = [
  {
    id: 'upload',
    label: 'Best next step',
    title: 'Upload a photo',
    detail: 'Start with the image and move directly into the custom kit flow.',
  },
  {
    id: 'preview',
    label: 'Lower-friction option',
    title: 'Request a preview',
    detail: 'Good for customers who want a quick confidence check before ordering.',
  },
  {
    id: 'gift',
    label: 'Seasonal angle',
    title: 'Create a gift-ready keepsake',
    detail: 'Position the product around birthdays, anniversaries, pets, and family milestones.',
  },
]

export function getOrderedStorySections() {
  return [...storySections].sort((first, second) => first.order - second.order)
}
