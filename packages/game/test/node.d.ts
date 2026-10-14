// Minimal declarations for the Node built-ins that the tests use. The repo has no @types/node (the
// packages are runtime-neutral); these cover exactly what the tests import.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  /** Paths relative to `path`, all levels down. */
  export function readdirSync(path: string, options: { recursive: true }): string[];
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

interface ImportMeta {
  readonly url: string;
}
