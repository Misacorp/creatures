import { useState } from 'preact/hooks';
import type { GameState } from './api';
import { Blueprints } from './Blueprints';
import { BulkDismantle } from './BulkDismantle';
import type { GearActions } from './gear-actions';
import { PartsRow } from './GearArt';
import type { GearState, JobResult } from './gear-types';
import {
  bagText,
  equipBestText,
  jobResultRarity,
  noticeLines,
  topCreatureIds,
  unequippedReason,
} from './gear-view';
import { GlossaryTag } from './Glossary';
import { InventoryGrid } from './InventoryGrid';
import { gearName } from './gear-view';
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
  const [bestNote, setBestNote] = useState<string | null>(null);
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
      {gear.notice !== null && (
        <section class="ws-section card-item notice-card" aria-labelledby="ws-notice">
          <h3 id="ws-notice">Gear has changed</h3>
          <ul>
            {noticeLines(gear.notice).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {gear.notice.unequipped.length > 0 && (
            <details>
              <summary>Why some items are in the bag</summary>
              <ul>
                {gear.notice.unequipped.map((note) => (
                  <li key={note.id}>
                    {gearName(note.baseId)} came off: {unequippedReason(note)}.
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p class="actions">
            <button
              type="button"
              class="primary"
              disabled={busy}
              onClick={() => {
                void actions.dismissNotice();
              }}
            >
              Got it
            </button>
          </p>
        </section>
      )}
      {reveal !== null && (
        <JobReveal
          result={reveal}
          items={gear.items}
          rarity={jobResultRarity(reveal)}
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
        {gear.items.length > 0 && (
          <p class="actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void actions.equipBest(topCreatureIds(state.creatures)).then((result) => {
                  if (result !== undefined) setBestNote(equipBestText(result));
                });
              }}
            >
              Equip best on your top 3
            </button>
            {bestNote !== null && (
              <span class="muted" role="status">
                {bestNote}
              </span>
            )}
          </p>
        )}
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
          <p class="muted">Tap an item to see its lines and what you can do with it.</p>
        )}
        {gear.items.length > 0 && (
          <BulkDismantle
            gear={gear}
            creatures={state.creatures}
            busy={busy}
            actions={actions}
            onStarted={() => {
              setSelectedId(null);
            }}
          />
        )}
      </section>
      <Blueprints
        gear={gear}
        creatures={state.creatures}
        busy={busy}
        loadPreview={actions.previewCraft}
        onCraft={async (baseId, creatureId, reach, treat) =>
          (await actions.startJob({
            kind: 'craft',
            creatureId,
            blueprintId: baseId,
            reach,
            ...(treat ? { treat: true } : {}),
          })) !== undefined
        }
      />
      <SupplyCrafting
        gear={gear}
        creatures={state.creatures}
        stock={state.supplies}
        busy={busy}
        onCraft={async (supplyId, creatureId, treat) =>
          (await actions.startJob({
            kind: 'supply',
            creatureId,
            supplyId,
            ...(treat ? { treat: true } : {}),
          })) !== undefined
        }
      />
    </div>
  );
}
