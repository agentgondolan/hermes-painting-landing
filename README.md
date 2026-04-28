# Painting Landing — Phase 4

Phase 4 adds a lightweight React Three Fiber hero scene on top of the existing GSAP narrative for the Makeyourcraft paint-by-numbers landing page.

## What changed

- Added a premium-but-light hero 3D composition built with React Three Fiber and Three.js
- Kept the existing Phase 1–3 content model and GSAP scroll narrative intact
- Added a hero reveal layer so the 3D object enters with the same desktop pinned story rhythm
- Enabled subtle pointer tilt only on fine-pointer devices
- Kept mobile behavior passive and reduced-motion behavior free of interactive transforms

## Architecture

- `app/page.tsx` — hero composition now includes the Phase 4 3D scene and updated hero copy block
- `components/hero-product-scene.tsx` — client-only wrapper, dynamic loading, pointer gating, and premium overlay treatment
- `components/product-scene-canvas.tsx` — lightweight Three.js / React Three Fiber scene, lighting, camera, materials, and idle motion
- `components/scroll-story.tsx` — GSAP hero timeline updated to reveal and carry the 3D scene
- `app/globals.css` — transform hints and reduced-motion handling updated for the new hero scene

## Run locally

```bash
cd apps/painting-landing
npm install
npm run dev
```

Open http://127.0.0.1:3206

## Production check

```bash
npm run preview
```

This app now keeps dev and production artifacts in separate directories (`.next/dev` and `.next/prod`) so local restarts do not trample each other.

## Notes

- Desktop keeps the richer reveal and pinned GSAP hero rhythm.
- Touch devices get passive motion without extra hover-driven work.
- Reduced-motion users keep the hero content without forced transforms.
- `npm run lint` is still unconfigured in this app because `next lint` prompts for first-time ESLint setup.
