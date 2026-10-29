import { creatureName, speciesName } from '../../game';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { ActionButton } from '../../ui/ActionButton';
import { CloseGlyph } from '../../ui/Drawer';
import { XpTrack } from '../../ui/XpTrack';
import { creatureOf, jobsReady } from '../world';
import { creatureBadge } from './camp-state';
import type { PartyState } from './party-state';

/**
 * The picked-up creature's card: who it is, its level and experience, what it is doing, and the one
 * thing it can do right now (open its sack, collect its craft, evolve). On a phone it sits between the
 * clearing and the camp; on a wide screen it is the side panel. The lit stations are the rest.
 */
export function HeldCard({
  state,
  onClose,
  onOpenSack,
  onCollect,
  onEvolve,
}: {
  state: PartyState;
  onClose: () => void;
  onOpenSack: (id: string) => void;
  onCollect: (jobId: string) => void;
  onEvolve: (id: string) => void;
}) {
  if (state.held === null) return null;
  const c = creatureOf(state.world, state.held);
  const name = creatureName(c);
  const badge = creatureBadge(state.world, c, state.lounger, state.caveTeam);
  const doing = badge.label.slice(badge.label.indexOf('.') + 1).trim();
  const ready = jobsReady(state.world).find((j) => j.creatureId === c.id);
  return (
    <section class="pp-card pix-panel" aria-label={`${name}, picked up`}>
      <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={3} class="pp-card-sprite" />
      <div class="pp-card-who">
        <p class="pp-card-name">
          {name}
          {c.nickname !== null && <span class="pp-card-species"> {speciesName(c.species)}</span>}
        </p>
        <XpTrack
          level={c.level}
          value={c.exp}
          max={Math.max(1, c.expNeeded ?? c.exp)}
          top={c.expNeeded === null}
          label={`${name}'s experience`}
          size="snug"
        />
        <p class="pp-card-doing">{doing}</p>
      </div>
      <div class="pp-card-act">
        {badge.bubble === 'loot' && (
          <ActionButton
            label="Open"
            onClick={() => {
              onOpenSack(c.id);
            }}
          />
        )}
        {ready !== undefined && (
          <ActionButton
            label="Collect"
            onClick={() => {
              onCollect(ready.id);
            }}
          />
        )}
        {badge.bubble === 'evolve' && c.evolution !== undefined && (
          <ActionButton
            label="Evolve"
            detail={`${String(c.evolution.essence)} Essence`}
            onClick={() => {
              onEvolve(c.id);
            }}
          />
        )}
      </div>
      <button type="button" class="pp-x" aria-label={`Put ${name} down`} onClick={onClose}>
        <CloseGlyph />
      </button>
    </section>
  );
}
