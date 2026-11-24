# HappyMoves - Shoulder Shelf Reach (standalone)

Full-screen webcam rehab game. Arm movements (MediaPipe pose tracking) control the game.
Video stays on the device and is never recorded.

## Run locally
```bash
npm install
npm run dev        # open http://localhost:5173 (camera works on localhost)
```

## Build
```bash
npm run build      # output in /dist (static files)
npm run preview
```

## Deploy (camera needs HTTPS - all hosts below provide it)
- **Netlify (fastest):** `npm run build`, then drag the `dist` folder onto https://app.netlify.com/drop
- **Vercel:** push to GitHub, import the repo on vercel.com. Framework: Vite, build `npm run build`, output `dist`.
- **GitHub Pages:** push to GitHub, run `npm run build`, publish the `dist` folder (e.g. with the gh-pages package or a Pages workflow).

## Add real art and sounds
Put files in `src/modules/task4-shelf-reach/assets/` (see `ASSETS.md` there for exact names).
Missing files fall back to built-in vector art and synthesized sound.

## Notes
- MediaPipe WASM is copied from node_modules into `public/mediapipe` by `scripts/copy-wasm.mjs` on dev/build.
- The pose model file is loaded from Google's public storage at runtime (needs internet).
