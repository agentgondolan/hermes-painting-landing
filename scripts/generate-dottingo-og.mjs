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
        padding: 66px 76px 58px;
        isolation: isolate;
      }
      .orb {
        position: absolute;
        border-radius: 999px;
        filter: blur(0.2px);
        z-index: -1;
      }
      .orb.one { width: 430px; height: 430px; right: 44px; top: -86px; background: rgba(148, 50, 193, 0.13); }
      .orb.two { width: 340px; height: 340px; right: 180px; bottom: -150px; background: rgba(199, 120, 231, 0.2); }
      .logo { width: 284px; height: auto; margin-bottom: 48px; }
      .headline {
        max-width: 650px;
        font-size: 70px;
        line-height: 0.96;
        letter-spacing: -0.065em;
        font-weight: 850;
        margin: 0 0 28px;
      }
      .headline span { color: #9432c1; }
      .sub {
        max-width: 610px;
        color: rgba(46, 45, 44, 0.72);
        font-size: 29px;
        line-height: 1.23;
        letter-spacing: -0.025em;
        margin: 0;
        font-weight: 560;
      }
      .pillrow { display: flex; gap: 14px; margin-top: 36px; }
      .pill {
        border-radius: 999px;
        background: rgba(148, 50, 193, 0.1);
        color: #6f1a9a;
        border: 1px solid rgba(148, 50, 193, 0.18);
        padding: 13px 18px;
        font-size: 20px;
        line-height: 1;
        font-weight: 720;
        letter-spacing: -0.02em;
      }
      .preview {
        position: absolute;
        right: 76px;
        top: 108px;
        width: 398px;
        height: 398px;
        border-radius: 42px;
        background: rgba(255, 255, 255, 0.72);
        box-shadow: 0 38px 90px rgba(46, 45, 44, 0.14), inset 0 0 0 1px rgba(148, 50, 193, 0.1);
        display: grid;
        place-items: center;
        overflow: hidden;
      }
      .preview::before {
        content: "";
        position: absolute;
        inset: 25px;
        border-radius: 34px;
        background:
          radial-gradient(circle at 26px 26px, #9432c1 0 5px, transparent 6px) 0 0 / 52px 52px,
          radial-gradient(circle at 26px 26px, rgba(148, 50, 193, 0.28) 0 4px, transparent 5px) 26px 26px / 52px 52px,
          linear-gradient(135deg, #fff 0%, #f8edfe 100%);
        box-shadow: inset 0 0 0 1px rgba(148, 50, 193, 0.1);
      }
      .art {
        position: relative;
        width: 242px;
        height: 242px;
        border-radius: 999px;
        background:
          radial-gradient(circle at 72px 72px, #2e2d2c 0 8px, transparent 9px),
          radial-gradient(circle at 118px 60px, #9432c1 0 8px, transparent 9px),
          radial-gradient(circle at 164px 84px, #c778e7 0 8px, transparent 9px),
          radial-gradient(circle at 88px 130px, #9432c1 0 8px, transparent 9px),
          radial-gradient(circle at 142px 142px, #2e2d2c 0 8px, transparent 9px),
          radial-gradient(circle at 182px 158px, #c778e7 0 8px, transparent 9px),
          radial-gradient(circle at 112px 190px, #9432c1 0 8px, transparent 9px),
          #ffffff;
        box-shadow: 0 22px 48px rgba(111, 26, 154, 0.2), inset 0 0 0 14px #ffffff, inset 0 0 0 16px rgba(148, 50, 193, 0.18);
      }
      .art::after {
        content: "";
        position: absolute;
        inset: 51px 43px 64px 43px;
        border-radius: 999px 999px 68px 68px;
        border: 12px solid #2e2d2c;
        border-bottom-width: 18px;
        opacity: 0.92;
      }
      .sparkle {
        position: absolute;
        right: 50px;
        bottom: 54px;
        color: #9432c1;
        font-size: 32px;
        font-weight: 900;
      }
      .footer {
        position: absolute;
        left: 76px;
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
      <p class="sub">Upload a picture, preview your custom design, and order a personalized handmade kit.</p>
      <div class="pillrow">
        <div class="pill">Instant preview</div>
        <div class="pill">Personalized kit</div>
      </div>
      <section class="preview" aria-hidden="true">
        <div class="art"></div>
        <div class="sparkle">✦</div>
      </section>
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
