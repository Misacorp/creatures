// Runs the live-calibrated projection (src/sim-live-cli.ts) without a build step, the same way
// scalars.mjs does (Vite's SSR loader transforms the TypeScript sources on the fly).
import { runCli } from './_load.mjs';

await runCli('/src/sim-live-cli.ts');
