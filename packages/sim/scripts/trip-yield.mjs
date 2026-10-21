// Runs the trip yield study (src/trip-yield-cli.ts): what one trip brings back by length and supply.
// Usage: node packages/sim/scripts/trip-yield.mjs [trips per cell, default 20000]
import { runCli } from './_load.mjs';

await runCli('/src/trip-yield-cli.ts');
