import { chromium, firefox, devices } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseDir = '/home/matej/.openclaw/workspace/tmp/browser-review';
const url = 'http://192.168.1.39:3206';

const runs = [
  {
    name: 'desktop',
    viewport: { width: 1440, height: 900 },
    options: {},
  },
  {
    name: 'mobile',
    viewport: { width: 390, height: 844 },
    options: { ...devices['iPhone 13'] },
  },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function reviewRun(browserType, browser, run) {
  const runDir = path.join(baseDir, run.name);
  const shotsDir = path.join(runDir, 'screenshots');
  const tracesDir = path.join(runDir, 'trace');
  await ensureDir(shotsDir);
  await ensureDir(tracesDir);

  const contextOptions = {
    ...run.options,
    viewport: run.viewport,
    recordVideo: { dir: path.join(runDir, 'video'), size: run.viewport },
  };
  if (browserType === 'firefox') {
    delete contextOptions.isMobile;
  }

  const context = await browser.newContext(contextOptions);

  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(String(err)));

  await context.tracing.start({ screenshots: true, snapshots: true });
  const startedAt = new Date().toISOString();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.screenshot({ path: path.join(shotsDir, '00-top.png') });
  await page.waitForTimeout(1200);

  const pageMeta = await page.evaluate(() => ({
    title: document.title,
    bodyClasses: document.body.className,
    href: location.href,
    headings: Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 20).map(el => el.textContent?.trim()).filter(Boolean),
    buttons: Array.from(document.querySelectorAll('button, a')).slice(0, 40).map(el => ({
      tag: el.tagName,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      href: el.tagName === 'A' ? el.getAttribute('href') : null,
    })).filter(x => x.text),
    sections: Array.from(document.querySelectorAll('section')).map((el, index) => ({
      index,
      id: el.id || null,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 140),
      top: el.getBoundingClientRect().top,
      height: el.getBoundingClientRect().height,
    })),
  }));

  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));

  const total = Math.max(metrics.scrollHeight - metrics.innerHeight, 0);
  const checkpoints = total > 0
    ? [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]
    : [0];

  let i = 1;
  for (const fraction of checkpoints) {
    const y = Math.round(total * fraction);
    await page.evaluate(async scrollToY => {
      window.scrollTo({ top: scrollToY, behavior: 'smooth' });
    }, y);
    await page.waitForTimeout(run.name === 'mobile' ? 1500 : 1200);
    await page.screenshot({ path: path.join(shotsDir, `${String(i).padStart(2, '0')}-${Math.round(fraction * 100)}.png`) });
    i += 1;
  }

  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shotsDir, '99-bottom.png') });

  const postMetrics = await page.evaluate(() => ({
    finalScrollY: window.scrollY,
    activeElement: document.activeElement?.tagName || null,
    focusedText: document.activeElement?.textContent?.trim()?.slice(0, 100) || null,
  }));

  await context.tracing.stop({ path: path.join(tracesDir, `${run.name}.zip`) });
  const video = page.video();
  await page.close();
  await context.close();
  const videoPath = video ? await video.path() : null;

  const report = {
    run: run.name,
    browserType,
    startedAt,
    finishedAt: new Date().toISOString(),
    url,
    viewport: run.viewport,
    metrics,
    postMetrics,
    pageMeta,
    consoleMessages,
    pageErrors,
    videoPath,
    screenshotsDir: shotsDir,
  };

  await fs.writeFile(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  await ensureDir(baseDir);
  const reports = [];
  let browser = null;
  let browserType = 'chromium';
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
    for (const run of runs) {
      reports.push(await reviewRun(browserType, browser, run));
    }
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    browserType = 'firefox';
    browser = await firefox.launch({ headless: true });
    for (const run of runs) {
      reports.push(await reviewRun(browserType, browser, run));
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const allVideos = [];
  for (const report of reports) {
    if (report.videoPath && await fileExists(report.videoPath)) allVideos.push(report.videoPath);
  }

  await fs.writeFile(path.join(baseDir, 'summary.json'), JSON.stringify({ url, reports, allVideos }, null, 2));
  console.log(JSON.stringify({ ok: true, baseDir, allVideos, reports: reports.map(r => ({ run: r.run, videoPath: r.videoPath, screenshotsDir: r.screenshotsDir })) }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
