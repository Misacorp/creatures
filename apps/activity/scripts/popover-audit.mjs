/**
 * The popover spacing audit is the popover part of `overlay-audit.mjs` (drawers and sheets too).
 * Kept so the old command still works: `node scripts/popover-audit.mjs [--only <entry>] [--width 390]`.
 */
import process from 'node:process';

process.argv.push('--kind', 'popover');
await import('./overlay-audit.mjs');
