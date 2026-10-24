import { cp, mkdir, rm } from 'node:fs/promises';

// Only public/ is distributed. The old static JSON, editor and guest
// information must never be copied into the deployment output.
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
await cp('public', 'dist', { recursive: true });
console.log('Built guest and admin static assets in dist/. Deploy with Pages Functions from functions/.');
