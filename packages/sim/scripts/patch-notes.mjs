// Drafts patch notes (src/patch-notes-cli.ts) without a build step, the same way run.mjs runs the
// balance simulator (Vite's SSR loader transforms the TypeScript sources on the fly).
import { runCli } from './_load.mjs';

await runCli('/src/patch-notes-cli.ts');
