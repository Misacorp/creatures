import { useEffect, useState } from 'preact/hooks';
import { defaultPick, type PickerOption } from './gear-view';

/**
 * The creature a job starter has picked, as a hook: the player's pick while that creature is still free,
 * otherwise the first free one (a creature that became busy is no longer picked). Returns the picked id (null
 * when nobody is free) and the function that picks.
 */
export function usePickedCreature(
  options: readonly PickerOption[],
): [creatureId: string | null, pick: (creatureId: string) => void] {
  const [picked, setPicked] = useState<string | null>(null);
  const valid = options.find((o) => o.creature.id === picked && o.busy === null);
  return [valid === undefined ? defaultPick(options) : picked, setPicked];
}

/** Where a server preview is: no creature to ask for (`idle`), on its way, failed, or here. */
export type PreviewStatusName = 'idle' | 'loading' | 'failed' | 'ready';

interface Answer<T> {
  creatureId: string;
  outcome: { ok: true; preview: T } | { ok: false };
}

/**
 * Asks the server for a preview that depends on the picked creature, and again whenever `deps` change (the
 * numbers follow what the player holds). An older answer never replaces a newer one, and a new creature
 * starts as `loading` at once; a change of `deps` alone keeps the last preview on screen until the new one
 * arrives.
 */
export function useJobPreview<T>(
  creatureId: string | null,
  load: (creatureId: string) => Promise<T>,
  deps: readonly unknown[],
): { status: PreviewStatusName; preview: T | null } {
  const [answer, setAnswer] = useState<Answer<T> | null>(null);
  useEffect(() => {
    if (creatureId === null) return;
    let current = true;
    load(creatureId).then(
      (preview) => {
        if (current) setAnswer({ creatureId, outcome: { ok: true, preview } });
      },
      () => {
        if (current) setAnswer({ creatureId, outcome: { ok: false } });
      },
    );
    return () => {
      current = false;
    };
  }, [creatureId, ...deps]);
  if (creatureId === null) return { status: 'idle', preview: null };
  if (answer === null || answer.creatureId !== creatureId) {
    return { status: 'loading', preview: null };
  }
  return answer.outcome.ok
    ? { status: 'ready', preview: answer.outcome.preview }
    : { status: 'failed', preview: null };
}
