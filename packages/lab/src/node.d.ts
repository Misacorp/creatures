// The few Node APIs the report CLI uses (the workspace installs no @types/node).
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void;
}
declare const console: { log(text: string): void; error(text: string): void };
