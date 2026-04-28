import { HeroProductScene } from '@/components/hero-product-scene'

export default function ScenePreviewPage() {
  return (
    <main className="h-[100svh] overflow-hidden bg-[linear-gradient(180deg,#faf5ee_0%,#efe3d3_56%,#e7d8c5_100%)]">
      <HeroProductScene compact />
    </main>
  )
}
