/**
 * The economy study CLI (`pnpm sim:economy`, run through `scripts/economy.mjs`): prints the markdown of
 * `economyMarkdown()`. No arguments.
 */
import { economyMarkdown } from './economy-study';

declare const console: { log(text: string): void };

export function main(): number {
  console.log(economyMarkdown());
  return 0;
}
