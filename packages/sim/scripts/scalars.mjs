// Writes the scalars registry and the content ids (src/scalars-cli.ts) without a build step, the
// same way run.mjs runs the balance simulator (Vite's SSR loader transforms the TypeScript sources
// on the fly).
import { runCli } from './_load.mjs';

await runCli('/src/scalars-cli.ts');
