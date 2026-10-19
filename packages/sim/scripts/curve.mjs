// Runs the raid curve study CLI (src/curve-cli.ts) without a build step, the same way journey.mjs and
// run.mjs run theirs (Vite's SSR loader transforms the TypeScript sources on the fly).
import { runCli } from './_load.mjs';

await runCli('/src/curve-cli.ts');
