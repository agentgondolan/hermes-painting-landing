import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputPath = resolve('public/opengraph-image.png')
const logoPath = resolve('public/brand/dottingo/dottingo-logo-purple.svg')
const logoSvg = await readFile(logoPath, 'utf8')
const logoUrl = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
      body {
        font-family: Outfit, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #2e2d2c;
        background:
          radial-gradient(circle at 13% 17%, rgba(148, 50, 193, 0.22) 0 2px, transparent 3px),
          radial-gradient(circle at 88% 24%, rgba(148, 50, 193, 0.2) 0 2px, transparent 3px),
          radial-gradient(circle at 24% 82%, rgba(199, 120, 231, 0.24) 0 2px, transparent 3px),
          linear-gradient(135deg, #ffffff 0%, #faf8ff 42%, #f0dcfa 100%);
      }
      .card {
        position: relative;
        width: 1200px;
        height: 630px;
        padding: 74px 84px 58px;
        isolation: isolate;
      }
      .orb {
        position: absolute;
        border-radius: 999px;
        filter: blur(0.2px);
        z-index: -1;
      }
      .orb.one { width: 520px; height: 520px; right: -120px; top: -150px; background: rgba(148, 50, 193, 0.12); }
      .orb.two { width: 430px; height: 430px; left: 490px; bottom: -210px; background: rgba(199, 120, 231, 0.18); }
      .logo { width: 314px; height: auto; margin-bottom: 68px; }
      .headline {
        max-width: 910px;
        font-size: 88px;
        line-height: 0.96;
        letter-spacing: -0.065em;
        font-weight: 850;
        margin: 0;
      }
      .headline span { color: #9432c1; }
      .footer {
        position: absolute;
        left: 84px;
        bottom: 44px;
        color: rgba(46, 45, 44, 0.54);
        font-size: 19px;
        font-weight: 640;
        letter-spacing: -0.01em;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="orb one"></div>
      <div class="orb two"></div>
      <img class="logo" src="${logoUrl}" alt="Dottingo" />
      <h1 class="headline">Turn your photo into <span>dot art</span></h1>
      <div class="footer">dottingo.sg</div>
    </main>
  </body>
</html>`

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })
await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } })
await browser.close()
console.log(`Generated ${outputPath}`)
