// The few Node APIs the report CLI uses (the workspace installs no @types/node): the report CLI, the parity digest, the track file and its test.
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
}
declare module 'node:os' {
  export function tmpdir(): string;
}
declare module 'node:url' {
  export class URL {
    constructor(input: string, base?: string);
  }
  export function fileURLToPath(url: string | URL): string;
}
interface ImportMeta {
  readonly url: string;
}
declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): {
    update(data: string): { digest(encoding: 'hex'): string };
  };
}
declare const console: { log(text: string): void; error(text: string): void };
declare function structuredClone<T>(value: T): T;
declare module 'node:perf_hooks' {
  export const performance: { now(): number };
}
