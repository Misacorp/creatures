/**
 * The combat v2 content (Knacks and talents with their effects) for the few client parts that read it (the reaction partners). It is loaded
 * with a dynamic `import()` behind `__DEV_TOOLS_BUILD__`, as the dev panel is: the combat v2 data is not in the shipped game's JavaScript until
 * phase 4 (`dev-build.test.ts` checks that no production script holds it), and the canvases that use it are staging-only. In a production
 * build the condition is the literal `false`, the import is dead code and the pack is always null; the parts that read it then work from
 * role and element alone (`reaction-partners.ts`). When combat v2 ships, remove the gate here and import the pack directly.
 */
import { useEffect, useState } from 'preact/hooks';
import type { PartnerPack } from './reaction-partners';

let pack: PartnerPack | null = null;
let loading: Promise<PartnerPack | null> | null = null;
const listeners = new Set<(p: PartnerPack) => void>();

/** Starts loading the pack (once) and resolves with it; null in a build without it. */
export function loadCombatPack(): Promise<PartnerPack | null> {
  if (!__DEV_TOOLS_BUILD__) return Promise.resolve(null);
  loading ??= import('@creatures/game/combat-v2').then((m) => {
    pack = m.combatV2;
    for (const listener of listeners) listener(m.combatV2);
    return pack;
  });
  return loading;
}

/** The pack once it has loaded (null before, and always in a production build). */
export function useCombatPack(): PartnerPack | null {
  const [now, setNow] = useState<PartnerPack | null>(pack);
  useEffect(() => {
    listeners.add(setNow);
    void loadCombatPack();
    return () => {
      listeners.delete(setNow);
    };
  }, []);
  return now;
}
