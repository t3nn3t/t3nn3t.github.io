import { mkdir, writeFile } from 'node:fs/promises';

const workerSource = `export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
`;

await mkdir(new URL('../dist/server/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/server/index.js', import.meta.url), workerSource);
