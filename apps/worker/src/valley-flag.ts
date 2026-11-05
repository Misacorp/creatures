/**
 * The `VALLEY_SYSTEMS` flag (docs/design/valley/phase5-plan.md, section 3). It counts only when `VALLEY` and `COMBAT_V2` are
 * "on" as well: the systems build on the valley shell and on combat v2's events. "on" without them is a configuration
 * mistake: the worker treats the flag as off and logs one error (once per isolate, so a busy worker does not flood the log).
 */
interface ValleyFlags {
  readonly VALLEY?: string;
  readonly COMBAT_V2?: string;
  readonly VALLEY_SYSTEMS?: string;
}

let reported = false;

export function valleySystemsOn(
  env: ValleyFlags,
  log: (message: string) => void = console.error,
): boolean {
  if (env.VALLEY_SYSTEMS !== 'on') return false;
  if (env.VALLEY === 'on' && env.COMBAT_V2 === 'on') return true;
  if (!reported) {
    reported = true;
    log(
      'config error: VALLEY_SYSTEMS is "on" but VALLEY and COMBAT_V2 are not both "on"; treating it as off',
    );
  }
  return false;
}

/** For tests: lets the once-only log fire again. */
export function resetValleySystemsLog(): void {
  reported = false;
}
