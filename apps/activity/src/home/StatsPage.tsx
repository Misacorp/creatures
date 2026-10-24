import type { Creature } from '../api';
import type { Profile } from '../expedition-types';
import { GlossaryTag } from '../Glossary';
import { glyphOrUnknown } from '../glyphs';
import { bonusSummary, milestoneViews } from '../journal-view';
import { Sprite } from '../sprites/Sprite';
import { statGroups } from '../stats-view';
import { Bar } from '../ui/Bar';
import { DataTable } from '../ui/DataTable';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { Tag } from '../ui/Tag';

/**
 * The Stats page, opened from the Stats pin on the Home board: "‹ Back" to Home, then the player's own numbers as
 * a stat sheet grouped by area (Expeditions, Dungeon, Collection, Raid; the groups are `stats-view.ts`, so a new
 * stat is a row there), then the milestones with the tiny permanent bonuses they give. Nothing about other
 * players and no list of explorers (a creature's expedition count is on its own page).
 */
export function StatsPage({
  profile,
  creatures,
  onBack,
}: {
  profile: Profile;
  creatures: readonly Creature[];
  onBack: () => void;
}) {
  const bonus = bonusSummary(profile.bonuses);
  return (
    <section class="home-sub stats-page" aria-label="Stats" onKeyDown={onDrillKey(onBack)}>
      <DrillHead title="Stats" backLabel="to Home" onBack={onBack} scroll focus />

      <div class="stat-sheet">
        {statGroups({ profile, creatures }).map((group) => (
          <section key={group.id} class="stat-group" data-group={group.id}>
            <h4 class="stat-group-title pix">
              <Sprite sprite={glyphOrUnknown(group.glyph)} scale={2} class="inline-glyph" />{' '}
              {group.title}
            </h4>
            <DataTable
              tabular
              rows={group.rows.map((row) => ({ label: row.label, value: row.value }))}
            />
          </section>
        ))}
      </div>

      <h4 class="stat-group-title pix">
        <GlossaryTag entry="milestone" look="text">
          Milestones
        </GlossaryTag>
      </h4>
      <p class="muted">
        {bonus === null
          ? 'No bonuses yet. Each milestone gives a very small one.'
          : `Your bonuses: ${bonus}.`}
      </p>
      <ul class="milestones">
        {milestoneViews(profile.milestones).map((m) => (
          <li key={m.id} class={m.reached ? 'milestone reached' : 'milestone'}>
            <p>
              <strong class="pix">{m.name}</strong>{' '}
              {m.bonus === null ? (
                <span class="milestone-lock" role="img" aria-label="Locked">
                  <Sprite sprite={glyphOrUnknown('lock')} scale={2} />
                </span>
              ) : (
                <span class="muted">{m.bonus}</span>
              )}
              {m.reached && (
                <Tag kind="badge" tone="good">
                  {' '}
                  Reached
                </Tag>
              )}
            </p>
            <Bar value={m.value} max={m.max} label={`${m.name}: ${m.progress}`} />
            <p class="muted">{m.progress}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
