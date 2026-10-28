/**
 * The one piece of Node the wiki's build uses: reading the game's stylesheets and font files (`plugin.ts`,
 * and the tests that check the same files). The app has no Node types on purpose, so this declares only
 * what is used.
 */
declare module 'node:fs' {
  export function readFileSync(path: string | URL): Uint8Array;
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
}
