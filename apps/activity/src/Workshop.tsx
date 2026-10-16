import { useState } from 'preact/hooks';
import type { GameState } from './api';
import { Blueprints } from './Blueprints';
import type { GearActions } from './gear-actions';
import { PartsRow } from './GearArt';
import type { GearState, JobResult } from './gear-types';
import { bagText, jobResultRarity } from './gear-view';
import { GlossaryTag } from './Glossary';
import { InventoryGrid } from './InventoryGrid';
import { ItemDetail } from './ItemDetail';
import { JobReveal } from './JobReveal';
import { JobSlots } from './JobSlots';
import { SupplyCrafting } from './SupplyCrafting';

/**
 * The Workshop tab: your parts, the job slots (with timers and claims), the bag of gear with
 * an item's details and actions, and the blueprints you can craft from. Everything shown comes from
 * the server's gear view; every action goes back to the server, which decides.
 */
export function Workshop({
  state,
  gear,
  failed,
  offset,
  busy,
  reveal,
  actions,
  onRetry,
  onClaimed,
  onDismissReveal,
}: {
  state: GameState;
  gear: GearState | null;
  /** The gear view could not be loaded. */
  failed: boolean;
  /** Server clock minus local clock, in ms. */
  offset: number;
  busy: boolean;
  reveal: JobResult | null;
  actions: GearActions;
  onRetry: () => void;
  onClaimed: (result: JobResult) => void;
  onDismissReveal: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (gear === null) {
    return failed ? (
      <section class="ws-section">
        <p class="error" role="alert">
          The Workshop could not be loaded.
        </p>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    ) : (
      <p class="muted">Opening the Workshop...</p>
    );
  }
  const selected = gear.items.find((i) => i.id === selectedId) ?? null;
  return (
    <div class="workshop">
      {reveal !== null && (
        <JobReveal
          result={reveal}
          items={gear.items}
          rarity={jobResultRarity(reveal, gear.items)}
          onDismiss={onDismissReveal}
        />
      )}
      <section class="ws-section" aria-labelledby="ws-parts">
        <h3 id="ws-parts">Parts</h3>
        <PartsRow parts={gear.parts} />
        <p class="muted">
          Supplies cannot be bought, so this is where you pick the kind and tier you want.{' '}
          <button
            type="button"
            onClick={() => {
              document.getElementById('ws-supplies')?.scrollIntoView({ block: 'start' });
            }}
          >
            Craft supplies for your trips
          </button>
        </p>
      </section>
      <JobSlots
        gear={gear}
        creatures={state.creatures}
        offset={offset}
        busy={busy}
        onClaim={(job) => {
          void actions.claimJob(job.id).then((result) => {
            if (result !== undefined) onClaimed(result);
          });
        }}
      />
      <section class="ws-section" aria-labelledby="ws-gear">
        <h3 id="ws-gear">
          Gear <GlossaryTag entry="gear" look="help" />
        </h3>
        <p class="muted">Bag: {bagText(gear.inventory)}</p>
        {gear.items.length === 0 ? (
          <p class="empty muted">
            Your bag is empty. Clear a raid finale or send explorers out to find gear and parts, or
            craft something from a blueprint.
          </p>
        ) : (
          <InventoryGrid
            items={gear.items}
            creatures={state.creatures}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        )}
        {selected !== null && (
          <ItemDetail
            key={selected.id}
            item={selected}
            gear={gear}
            creatures={state.creatures}
            busy={busy}
            actions={actions}
            onGone={() => {
              setSelectedId(null);
            }}
          />
        )}
        {gear.items.length > 0 && selected === null && (
          <p class="muted">Tap an item to see its stats and what you can do with it.</p>
        )}
      </section>
      <Blueprints
        gear={gear}
        creatures={state.creatures}
        busy={busy}
        onCraft={async (baseId, creatureId) =>
          (await actions.startJob({ kind: 'craft', creatureId, blueprintId: baseId })) !== undefined
        }
      />
      <SupplyCrafting
        gear={gear}
        creatures={state.creatures}
        stock={state.supplies}
        busy={busy}
        onCraft={async (supplyId, creatureId) =>
          (await actions.startJob({ kind: 'supply', creatureId, supplyId })) !== undefined
        }
      />
    </div>
  );
}
