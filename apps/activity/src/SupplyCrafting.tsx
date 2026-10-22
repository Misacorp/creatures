import { supplyDef } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { supplyEntry } from './ExpeditionIcons';
import { CostList } from './GearArt';
import { GlossaryTag } from './Glossary';
import type { GearState } from './gear-types';
import {
  nominalDurationCountItem,
  supplyCraftViews,
  supplyDurationFor,
  supplyLevelBlocker,
} from './gear-view';
import { capitalize } from './game';
import { glyphOrUnknown } from './glyphs';
import { JobDrawer } from './JobWizard';
import { supplyActions, supplyJob, type SupplyAction } from './supply-job';
import { Sprite } from './sprites/Sprite';
import { kindLabel, supplyEffect } from './trip-view';
import { CountBadge } from './ui/CountBadge';
import { tierRarityClass, type SupplyTier } from './supply-tiers';
import { SupplyGrid, type SupplyCell } from './ui/SupplyGrid';
import { Tag } from './ui/Tag';

/** Which job is open, and the button that opened it (it gets the focus back when the drawer closes). */
interface Opened {
  action: SupplyAction;
  opener: HTMLElement | null;
}

/**
 * The Workshop's supply section, one compact picker (Misa's version C, 2026-10-20): a grid of the supplies'
 * pictures (kinds across, tiers down, a rarity edge on each), and one card under it for the chosen one with
 * what it does, its cost, time and Crafting level and the actions: Craft (the main button) and the small
 * Refine and Recycle. Each opens the job wizard in a drawer (`JobDrawer`: the recipe, who crafts, ready); the
 * supplies are taken when a convert job starts and arrive when it is claimed.
 */
export function SupplyCrafting({
  gear,
  creatures,
  stock,
  busy,
  error = null,
  onCraft,
  onConvert,
}: {
  gear: GearState;
  creatures: readonly Creature[];
  /** Supplies in stock (the state's `supplies`). */
  stock: Readonly<Record<string, number>>;
  busy: boolean;
  /** The server's last error; the open job's drawer shows it after a start that failed. */
  error?: string | null;
  /** Starts the craft; resolves true when it started (the drawer then closes). */
  onCraft: (supplyId: string, creatureId: string, treat: boolean) => Promise<boolean>;
  /** Starts a refine or recycle; resolves true when it started (the drawer then closes). */
  onConvert: (recipeId: string, creatureId: string, treat: boolean) => Promise<boolean>;
}) {
  const views = supplyCraftViews(stock);
  const kinds = [...new Set(views.map((v) => v.kind))];
  const blockerOf = (level: number) => supplyLevelBlocker(level, gear.skills, creatures);
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<Opened | null>(null);

  const first = views.find((v) => blockerOf(v.level) === null) ?? views[0];
  const view = views.find((v) => v.id === picked) ?? first;
  const cells: SupplyCell[] = views.map((v) => {
    const muted = blockerOf(v.level) !== null;
    return {
      id: v.id,
      kind: v.kind,
      tier: v.tier as SupplyTier,
      owned: v.owned,
      muted,
      label: `${v.name}, ${String(v.owned)} in stock${muted ? ', no creature can craft it yet' : ''}`,
    };
  });

  const def = view === undefined ? undefined : supplyDef(view.id);
  const actions = view === undefined ? null : supplyActions(view, stock, gear, creatures);
  const blocker = actions?.blocker ?? null;
  const refineReason = actions?.refineReason ?? null;
  const recycleReason = actions?.recycleReason ?? null;

  const choose = (id: string) => {
    setPicked(id);
    setOpen(null);
  };

  const job =
    open === null || view === undefined || actions === null
      ? null
      : supplyJob(open.action, view, actions, gear, { onCraft, onConvert });

  return (
    <section class="ws-section supply-section" aria-labelledby="ws-supplies">
      <h3 id="ws-supplies">
        Supplies <GlossaryTag entry="supplies" look="help" />
      </h3>
      <SupplyGrid kinds={kinds} cells={cells} selected={view?.id ?? null} onSelect={choose} />
      {view !== undefined && (
        <div
          class={`supply-card card-item supply-card-pointer ${tierRarityClass(view.tier)}`}
          style={{ '--supply-col': String(kinds.indexOf(view.kind)) }}
        >
          <div class="bp-row">
            <span class="supply-icon">
              <Sprite sprite={glyphOrUnknown(view.kind)} scale={4} />
            </span>
            <div class="bp-text">
              <p class="pix bp-name rarity-name">{view.name}</p>
              <p class="tags">
                <Tag entry={supplyEntry(view.kind)}>{kindLabel(view.kind)}</Tag>
                <Tag>{capitalize(view.tier)}</Tag>
              </p>
              <p class="muted supply-owned" aria-live="polite">
                In stock: {view.owned}
              </p>
            </div>
          </div>
          {def !== undefined && <p class="supply-effect">{supplyEffect(def)}</p>}
          <CostList
            cost={view.cost}
            have={gear.parts}
            bait={view.bait}
            baitHave={gear.balances.bait}
          />
          <p class="bp-meta muted">
            <span>
              Crafting level {view.level}
              {view.yieldCount > 1 ? ` · makes ${String(view.yieldCount)}` : ''}
            </span>
            <CountBadge {...nominalDurationCountItem(supplyDurationFor(view.id, 1))} />
          </p>
          <p class="actions">
            <button
              type="button"
              class="primary"
              disabled={busy || blocker !== null}
              onClick={(event) => {
                setOpen({ action: 'craft', opener: event.currentTarget });
              }}
            >
              Craft
            </button>
          </p>
          {blocker !== null && <p class="reason">{blocker}</p>}
          <div class="supply-more">
            <div class="supply-more-item">
              <button
                type="button"
                disabled={busy || refineReason !== null}
                aria-describedby={refineReason === null ? undefined : 'supply-refine-reason'}
                onClick={(event) => {
                  setOpen({ action: 'refine', opener: event.currentTarget });
                }}
              >
                Refine
              </button>
              {refineReason !== null && (
                <p id="supply-refine-reason" class="muted supply-more-reason">
                  {refineReason}
                </p>
              )}
            </div>
            <div class="supply-more-item">
              <button
                type="button"
                disabled={busy || recycleReason !== null}
                aria-describedby={recycleReason === null ? undefined : 'supply-recycle-reason'}
                onClick={(event) => {
                  setOpen({ action: 'recycle', opener: event.currentTarget });
                }}
              >
                Recycle
              </button>
              {recycleReason !== null && (
                <p id="supply-recycle-reason" class="muted supply-more-reason">
                  {recycleReason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {job !== null && open !== null && (
        <JobDrawer
          {...job}
          gear={gear}
          creatures={creatures}
          busy={busy}
          error={error}
          returnFocusTo={open.opener}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </section>
  );
}
