// Runs the economy study (src/economy-cli.ts): exact expected values of every trip length and supply,
// ROI tables and the rows that break the economy targets. Usage: pnpm sim:economy
import { runCli } from './_load.mjs';

await runCli('/src/economy-cli.ts');
