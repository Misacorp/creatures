import { useEffect, useState } from 'preact/hooks';
import { fetchGear } from './gear-api';
import { grantsForWeek, lootIsEmpty } from './gear-view';
import type { GrantRecord } from './gear-types';
import { LootList } from './GearLoot';
import { RevealLater } from './ui/RevealShell';

/**
 * The gear a finale gave this player for one raid week: the roll for clearing it and, in a Festival
 * week, the Festival piece. They are read from the gear view's grants (`raid:<week>:finale`,
 * `festival:<week>`), so nothing here decides anything. It pops in with the rest of the reveal
 * (`done`) and shows nothing at all when there is no grant or the gear view cannot be loaded.
 */
export function FinaleGearLoot({ week, done }: { week: string; done: boolean }) {
  const [found, setFound] = useState<{ finale: GrantRecord | null; festival: GrantRecord | null }>({
    finale: null,
    festival: null,
  });
  useEffect(() => {
    let cancelled = false;
    fetchGear().then(
      (gear) => {
        if (!cancelled) setFound(grantsForWeek(gear.grants, week));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [week]);

  const grants = [
    { grant: found.finale, label: 'Gear from the finale' },
    { grant: found.festival, label: 'Festival gear' },
  ].flatMap((g) => (g.grant === null || lootIsEmpty(g.grant) ? [] : [{ ...g, grant: g.grant }]));
  if (grants.length === 0) return null;
  return (
    <RevealLater done={done}>
      {grants.map(({ grant, label }) => (
        <section key={grant.key}>
          <h4 class="pix">{label}</h4>
          <LootList loot={grant} label={label} />
        </section>
      ))}
    </RevealLater>
  );
}
