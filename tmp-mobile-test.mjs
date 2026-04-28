import { chromium, devices } from 'playwright'

const url = 'http://127.0.0.1:3206'
const device = devices['iPhone 13']

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ ...device })
const page = await context.newPage()

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

const target = page.locator('[data-hero-product-scene]').first()
await target.scrollIntoViewIfNeeded()
const box = await target.boundingBox()
if (!box) throw new Error('hero scene not found')

await page.screenshot({ path: '/tmp/hero-mobile-before.png', fullPage: true })

const startX = box.x + box.width * 0.75
const endX = box.x + box.width * 0.25
const y = box.y + box.height * 0.55

await page.touchscreen.tap(startX, y)
await page.touchscreen.tap(startX, y)

await page.locator('[data-hero-product-scene]').dispatchEvent('pointerdown', {
  clientX: startX,
  clientY: y,
  pointerType: 'touch',
  pointerId: 1,
  isPrimary: true,
  buttons: 1,
})

for (let i = 1; i <= 14; i += 1) {
  const x = startX + ((endX - startX) * i) / 14
  await page.locator('[data-hero-product-scene]').dispatchEvent('pointermove', {
    clientX: x,
    clientY: y,
    pointerType: 'touch',
    pointerId: 1,
    isPrimary: true,
    buttons: 1,
  })
}

await page.locator('[data-hero-product-scene]').dispatchEvent('pointerup', {
  clientX: endX,
  clientY: y,
  pointerType: 'touch',
  pointerId: 1,
  isPrimary: true,
  buttons: 0,
})

await page.waitForTimeout(1200)
await page.screenshot({ path: '/tmp/hero-mobile-after.png', fullPage: true })

const info = await page.evaluate(() => {
  const scene = document.querySelector('[data-hero-product-scene]')
  const canvas = document.querySelector('canvas')
  return {
    title: document.title,
    hasScene: !!scene,
    hasCanvas: !!canvas,
    sceneClass: scene?.className ?? null,
    bodyPreview: document.body.innerText.slice(0, 220),
  }
})

console.log(JSON.stringify(info, null, 2))
await browser.close()
