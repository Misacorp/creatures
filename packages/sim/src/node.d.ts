// Minimal declarations for the few Node built-ins the CLI uses. The repo has no @types/node (the
// other packages are runtime-neutral); these cover exactly what src/cli.ts imports.
declare module 'node:fs' {
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function writeFileSync(path: string, data: string): void;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
}

declare module 'node:util' {
  export interface ParseArgsOption {
    type: 'string' | 'boolean';
    short?: string;
  }
  export function parseArgs(config: {
    args?: readonly string[];
    options: Readonly<Record<string, ParseArgsOption>>;
    strict?: boolean;
    allowPositionals?: boolean;
  }): {
    values: Record<string, string | boolean | undefined>;
    positionals: string[];
  };
}

declare module 'node:os' {
  export function tmpdir(): string;
}
