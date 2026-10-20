import { supplyDef } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { BaitCost } from './BaitCost';
import {
  conversionDurationFor,
  conversionOf,
  shortText,
  type ConversionView,
} from './conversion-view';
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
import { JobStarter } from './JobStarter';
import { Sprite } from './sprites/Sprite';
import { kindName, supplyEffect } from './trip-view';
import { CountBadge } from './ui/CountBadge';
import { RecipeCard } from './ui/RecipeCard';
import { tierRarityClass, type SupplyTier } from './supply-tiers';
import { SupplyGrid, type SupplyCell } from './ui/SupplyGrid';
import { Tag } from './ui/Tag';

type Action = 'craft' | 'refine' | 'recycle';

/**
 * The Workshop's supply section, one compact picker (Misa's version C, 2026-10-20): a grid of the supplies'
 * pictures (kinds across, tiers down, a rarity edge on each), and one card under it for the chosen one with
 * what it does, its cost, time and Crafting level and the actions: Craft (the main button) and the small
 * Refine and Recycle. Each opens the same creature picker as every Workshop job; the supplies are taken when
 * a convert job starts and arrive when it is claimed. Supplies cannot be bought: this, the dungeon and trips
 * are where they come from.
 */
export function SupplyCrafting({
  gear,
  creatures,
  stock,
  busy,
  onCraft,
  onConvert,
}: {
  gear: GearState;
  creatures: readonly Creature[];
  /** Supplies in stock (the state's `supplies`). */
  stock: Readonly<Record<string, number>>;
  busy: boolean;
  /** Starts the craft; resolves true when it started (the picker then closes). */
  onCraft: (supplyId: string, creatureId: string, treat: boolean) => Promise<boolean>;
  /** Starts a refine or recycle; resolves true when it started (the picker then closes). */
  onConvert: (recipeId: string, creatureId: string, treat: boolean) => Promise<boolean>;
}) {
  const views = supplyCraftViews(stock);
  const kinds = [...new Set(views.map((v) => v.kind))];
  const blockerOf = (level: number) => supplyLevelBlocker(level, gear.skills, creatures);
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<Action | null>(null);

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
  const blocker = view === undefined ? null : blockerOf(view.level);
  const refine = view === undefined ? null : conversionOf('refine', view.id, stock, gear.parts);
  const recycle = view === undefined ? null : conversionOf('recycle', view.id, stock, gear.parts);
  const refineReason =
    refine === null
      ? 'Already the best tier.'
      : (shortText(refine.inputs) ?? blockerOf(refine.level));
  const recycleReason =
    recycle === null
      ? 'Basic supplies cannot be recycled.'
      : (shortText(recycle.inputs) ?? blockerOf(recycle.level));
  const convertOpen: ConversionView | null =
    open === 'refine' ? refine : open === 'recycle' ? recycle : null;
  const convertReason = open === 'refine' ? refineReason : recycleReason;

  const choose = (id: string) => {
    setPicked(id);
    setOpen(null);
  };

  return (
    <section class="ws-section supply-section" aria-labelledby="ws-supplies">
      <h3 id="ws-supplies">
        Supplies <GlossaryTag entry="supplies" look="help" />
      </h3>
      <p class="muted supply-note">Supplies cannot be bought. Craft them here.</p>
      <SupplyGrid kinds={kinds} cells={cells} selected={view?.id ?? null} onSelect={choose} />
      {view !== undefined && (
        <div class={`supply-card card-item ${tierRarityClass(view.tier)}`}>
          <div class="bp-row">
            <span class="supply-icon">
              <Sprite sprite={glyphOrUnknown(view.kind)} scale={4} />
            </span>
            <div class="bp-text">
              <p class="pix bp-name rarity-name">{view.name}</p>
              <p class="tags">
                <Tag entry={supplyEntry(view.kind)}>{kindName(view.kind)}</Tag>
                <Tag>{capitalize(view.tier)}</Tag>
              </p>
              <p class="muted supply-owned" aria-live="polite">
                In stock: {view.owned}
              </p>
            </div>
          </div>
          {def !== undefined && <p class="supply-effect">{supplyEffect(def)}</p>}
          <CostList cost={view.cost} have={gear.parts} />
          {view.bait > 0 && <BaitCost cost={view.bait} have={gear.balances.bait} />}
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
              onClick={() => {
                setOpen('craft');
              }}
            >
              Craft
            </button>
          </p>
          {blocker !== null && <p class="reason">{blocker}</p>}
          <p class="supply-more">
            <button
              type="button"
              disabled={busy || refineReason !== null}
              onClick={() => {
                setOpen('refine');
              }}
            >
              Refine
            </button>
            <button
              type="button"
              disabled={busy || recycleReason !== null}
              onClick={() => {
                setOpen('recycle');
              }}
            >
              Recycle
            </button>
          </p>
          {(refineReason !== null || recycleReason !== null) && (
            <p class="muted supply-more-reason">
              {refineReason !== null && <span>Refine: {refineReason} </span>}
              {recycleReason !== null && <span>Recycle: {recycleReason}</span>}
            </p>
          )}
          {open === 'craft' && (
            <JobStarter
              id={`supply-${view.id}`}
              kind="supply"
              title={`Craft ${view.name}`}
              cost={view.cost}
              bait={view.bait}
              gear={gear}
              creatures={creatures}
              busy={busy}
              startLabel="Start crafting"
              minLevel={view.level}
              durationAtLevel={(level) => supplyDurationFor(view.id, level)}
              extraBlocker={blocker}
              onStart={(creatureId, treat) => {
                void onCraft(view.id, creatureId, treat).then((started) => {
                  if (started) setOpen(null);
                });
              }}
              onCancel={() => {
                setOpen(null);
              }}
            />
          )}
          {convertOpen !== null && (
            <>
              <RecipeCard
                compact
                inputs={convertOpen.inputs}
                outputs={convertOpen.outputs}
                duration={nominalDurationCountItem(conversionDurationFor(convertOpen.id, 1))}
                actionLabel={convertOpen.verb}
                onStart={() => undefined}
              />
              <JobStarter
                id={`convert-${convertOpen.id}`}
                kind="convert"
                title={convertOpen.verb}
                cost={{}}
                gear={gear}
                creatures={creatures}
                busy={busy}
                startLabel={`Start ${convertOpen.verb.toLowerCase()}`}
                minLevel={convertOpen.level}
                durationAtLevel={(level) => conversionDurationFor(convertOpen.id, level)}
                extraBlocker={convertReason}
                onStart={(creatureId, treat) => {
                  void onConvert(convertOpen.id, creatureId, treat).then((started) => {
                    if (started) setOpen(null);
                  });
                }}
                onCancel={() => {
                  setOpen(null);
                }}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
