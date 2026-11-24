// Copies the MediaPipe WASM runtime into /public so the hosted site does not depend on a CDN.
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const from = 'node_modules/@mediapipe/tasks-vision/wasm';
const to = 'public/mediapipe/wasm';

if (!existsSync(from)) {
  console.error('MediaPipe not installed. Run "npm install" first.');
  process.exit(1);
}
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log('MediaPipe WASM copied to', to);
