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

- **Vercel:** 



## Notes
- MediaPipe WASM is copied from node_modules into `public/mediapipe` by `scripts/copy-wasm.mjs` on dev/build.
- The pose model file is loaded from Google's public storage at runtime (needs internet).
