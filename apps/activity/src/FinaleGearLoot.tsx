import { fetchGear } from './gear-api';
import { grantsForWeek, lootIsEmpty } from './gear-view';
import type { GrantRecord } from './gear-types';
import { LootList } from './LootList';
import { RevealLater } from './ui/RevealShell';
import { useLoaded } from './use-loaded';

const NO_GRANTS: { finale: GrantRecord | null; festival: GrantRecord | null } = {
  finale: null,
  festival: null,
};

/**
 * What a finale gave this player for one raid week: the reward slot for clearing it (a gear piece,
 * shown with its rarity and "+N" upgrade level, or a new blueprint) and, in a Festival week, the
 * Festival piece. They are read from the gear view's grants (`raid:<week>:finale`,
 * `festival:<week>`), so nothing here decides anything. It pops in with the rest of the reveal
 * (`done`) and shows nothing at all when there is no grant or the gear view cannot be loaded.
 */
export function FinaleGearLoot({ week, done }: { week: string; done: boolean }) {
  const loaded = useLoaded(async () => grantsForWeek((await fetchGear()).grants, week), [week]);
  const found = loaded.value ?? NO_GRANTS;

  const grants = [
    { grant: found.finale, label: 'Your finale reward' },
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
