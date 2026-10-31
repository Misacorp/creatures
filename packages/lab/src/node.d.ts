// The few Node APIs the report CLI uses (the workspace installs no @types/node): the report CLI and the parity digest.
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void;
}
declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): {
    update(data: string): { digest(encoding: 'hex'): string };
  };
}
declare const console: { log(text: string): void; error(text: string): void };
declare function structuredClone<T>(value: T): T;
