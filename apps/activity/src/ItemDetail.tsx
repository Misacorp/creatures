import { GLOSSARY_IDS, gearBase } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { creatureName } from './game';
import type { GearActions } from './gear-actions';
import { CostList, ItemFrame, ItemSprite, RarityTag } from './GearArt';
import type { GearItem, GearState } from './gear-types';
import {
  enchantName,
  enchantStatus,
  formatBonus,
  gearName,
  statEntry,
  statLabel,
  upgradeStatus,
} from './gear-view';
import { GlossaryTag } from './Glossary';
import {
  DismantleConfirm,
  EnchantPanel,
  ImprovePanel,
  improveBlocker,
  type JobDetail,
} from './ItemPanels';
import { ElementChip } from './sprites/ElementChip';

type Panel = 'improve' | 'enchant' | 'dismantle' | 'equip' | null;

/** The stats of an item: the main one, the extra ones and the enchant, each explained by a tag. */
function Stats({ item }: { item: GearItem }) {
  const status = enchantStatus(item);
  return (
    <ul class="stat-list" aria-label="Stats">
      <li>
        <GlossaryTag entry={statEntry(item.primary.stat)}>
          {statLabel(item.primary.stat)}
        </GlossaryTag>{' '}
        <strong class="gear-bonus">{formatBonus(item.primary.stat, item.primary.bp)}</strong>{' '}
        <span class="muted">main stat</span>
      </li>
      {item.secondaries.map((s, i) => (
        <li key={i}>
          <GlossaryTag entry={statEntry(s.stat)}>{statLabel(s.stat)}</GlossaryTag>{' '}
          <strong class="gear-bonus">{formatBonus(s.stat, s.bp)}</strong>{' '}
          <span class="muted">extra stat</span>
        </li>
      ))}
      {item.enchantId !== null && (
        <li>
          <GlossaryTag entry={GLOSSARY_IDS.enchant(item.enchantId)}>
            Enchant: {enchantName(item.enchantId)}
          </GlossaryTag>
          {status !== null && <span class="muted"> {status}</span>}
        </li>
      )}
    </ul>
  );
}

/** Equip on a creature (a list to pick from) or take it off. */
function EquipPanel({
  item,
  creatures,
  busy,
  onEquip,
  onCancel,
}: {
  item: GearItem;
  creatures: readonly Creature[];
  busy: boolean;
  onEquip: (creatureId: string) => void;
  onCancel: () => void;
}) {
  const options = creatures.filter((c) => c.id !== item.equippedOn);
  const [picked, setPicked] = useState(options[0]?.id ?? '');
  const target = options.find((c) => c.id === picked) ?? options[0];
  const selectId = `equip-${item.id}`;
  if (target === undefined) return <p class="muted">No other creature to give it to.</p>;
  return (
    <section class="equip-panel" aria-label="Equip">
      <label for={selectId}>Equip on</label>
      <select
        id={selectId}
        value={target.id}
        onChange={(event) => {
          setPicked(event.currentTarget.value);
        }}
      >
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {creatureName(c)} (level {c.level})
            {c.gear === null ? '' : `, wears ${gearName(c.gear.baseId)}`}
          </option>
        ))}
      </select>
      {target.gear !== null && (
        <p class="muted">
          {creatureName(target)} gives up {gearName(target.gear.baseId)}. It goes back in the bag.
        </p>
      )}
      <p class="actions">
        <button
          type="button"
          class="primary"
          disabled={busy}
          onClick={() => {
            onEquip(target.id);
          }}
        >
          Equip on {creatureName(target)}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </p>
    </section>
  );
}

/**
 * One item of the bag: its stats, who wears it and every action (Upgrade, Equip or Take off,
 * Improve, Enchant, Dismantle). A button that cannot be used says why in words under it.
 */
export function ItemDetail({
  item,
  gear,
  creatures,
  busy,
  actions,
  onGone,
}: {
  item: GearItem;
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  actions: GearActions;
  /** The item no longer exists (dismantled): the screen drops the selection. */
  onGone: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Choosing another item starts clean and moves focus to its name.
  useEffect(() => {
    setPanel(null);
    heading.current?.focus();
  }, [item.id]);

  const base = gearBase(item.baseId);
  const wearer = creatures.find((c) => c.id === item.equippedOn);
  const upgrade = upgradeStatus(item, gear);
  const improve = improveBlocker(item);
  const inJob = item.jobId !== null;

  return (
    <section class="item-detail card-item" aria-labelledby={`item-${item.id}-name`}>
      <div class="item-head">
        <ItemFrame rarity={item.rarity} class="big">
          <ItemSprite baseId={item.baseId} scale={6} />
        </ItemFrame>
        <div class="item-title">
          <h3 id={`item-${item.id}-name`} tabIndex={-1} ref={heading}>
            {gearName(item.baseId)} <span class="lvl">+{item.level}</span>
          </h3>
          <p class="tags">
            <RarityTag rarity={item.rarity} />
            {base?.tint !== null && base?.tint !== undefined && <ElementChip element={base.tint} />}
          </p>
          {base !== undefined && <p class="muted flavor">{base.flavor}</p>}
        </div>
      </div>
      <Stats item={item} />
      <p>
        {wearer === undefined ? (
          'Not worn by anyone.'
        ) : (
          <>
            Worn by <strong>{creatureName(wearer)}</strong>.
          </>
        )}
        {inJob && <span class="muted"> It is in a Workshop job.</span>}
      </p>

      <div class="item-actions">
        <div class="action-row">
          <button
            type="button"
            class="primary"
            disabled={busy || !upgrade.enabled}
            onClick={() => {
              void actions.upgrade(item.id);
            }}
          >
            {item.upgradeCost === null ? 'Top level' : `Upgrade to +${String(item.level + 1)}`}
          </button>
          {item.upgradeCost !== null && (
            <CostList
              cost={{ scrap: item.upgradeCost.scrap }}
              have={gear.parts}
              essence={item.upgradeCost.essence}
              essenceHave={gear.balances.essence}
            />
          )}
        </div>
        {upgrade.reason !== null && <p class="reason">{upgrade.reason}</p>}

        <p class="actions">
          {item.equippedOn === null ? (
            <button
              type="button"
              disabled={busy}
              aria-expanded={panel === 'equip'}
              onClick={() => {
                setPanel(panel === 'equip' ? null : 'equip');
              }}
            >
              Equip
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void actions.equip(item.id, null);
              }}
            >
              Take off
            </button>
          )}
          {item.equippedOn !== null && (
            <button
              type="button"
              disabled={busy}
              aria-expanded={panel === 'equip'}
              onClick={() => {
                setPanel(panel === 'equip' ? null : 'equip');
              }}
            >
              Give to another
            </button>
          )}
        </p>
        {panel === 'equip' && (
          <EquipPanel
            item={item}
            creatures={creatures}
            busy={busy}
            onEquip={(creatureId) => {
              void actions.equip(item.id, creatureId).then((result) => {
                if (result !== undefined) setPanel(null);
              });
            }}
            onCancel={() => {
              setPanel(null);
            }}
          />
        )}

        <p class="actions">
          <button
            type="button"
            disabled={busy || improve !== null || inJob}
            aria-expanded={panel === 'improve'}
            onClick={() => {
              setPanel(panel === 'improve' ? null : 'improve');
            }}
          >
            Improve
          </button>
          <GlossaryTag entry={GLOSSARY_IDS.job('improve')} look="help" />
          <button
            type="button"
            disabled={busy || inJob}
            aria-expanded={panel === 'enchant'}
            onClick={() => {
              setPanel(panel === 'enchant' ? null : 'enchant');
            }}
          >
            Enchant
          </button>
          <GlossaryTag entry={GLOSSARY_IDS.job('enchant')} look="help" />
        </p>
        {improve !== null && <p class="reason">{improve}</p>}
        {inJob && <p class="reason">This item is in a Workshop job. Claim the job first.</p>}
        {(panel === 'improve' || panel === 'enchant') && (
          <JobPanel
            panel={panel}
            item={item}
            gear={gear}
            creatures={creatures}
            busy={busy}
            actions={actions}
            onClose={() => {
              setPanel(null);
            }}
          />
        )}

        <p class="actions">
          <button
            type="button"
            class="danger"
            disabled={busy || inJob}
            aria-expanded={panel === 'dismantle'}
            onClick={() => {
              setPanel('dismantle');
            }}
          >
            Dismantle
          </button>
        </p>
        {panel === 'dismantle' && (
          <DismantleConfirm
            item={item}
            wearer={wearer}
            busy={busy}
            onConfirm={() => {
              void actions.dismantle(item.id).then((result) => {
                if (result !== undefined) onGone();
                else setPanel(null);
              });
            }}
            onCancel={() => {
              setPanel(null);
            }}
          />
        )}
      </div>
    </section>
  );
}

/** The Improve or Enchant starter of an item. */
function JobPanel({
  panel,
  item,
  gear,
  creatures,
  busy,
  actions,
  onClose,
}: {
  panel: 'improve' | 'enchant';
  item: GearItem;
  gear: GearState;
  creatures: readonly Creature[];
  busy: boolean;
  actions: GearActions;
  onClose: () => void;
}) {
  const start = async (creatureId: string, detail: JobDetail) => {
    const started = await actions.startJob(toRequest(item.id, creatureId, detail));
    if (started !== undefined) onClose();
    return started !== undefined;
  };
  return panel === 'improve' ? (
    <ImprovePanel
      item={item}
      gear={gear}
      creatures={creatures}
      busy={busy}
      onCancel={onClose}
      onStart={start}
    />
  ) : (
    <EnchantPanel
      item={item}
      gear={gear}
      creatures={creatures}
      busy={busy}
      onCancel={onClose}
      onStart={start}
    />
  );
}

/** The job request for an item: an improve names the extra stat, an enchant names the enchant. */
function toRequest(gearId: string, creatureId: string, detail: JobDetail) {
  return 'secondaryIndex' in detail
    ? ({
        kind: 'improve',
        creatureId,
        gearId,
        secondaryIndex: detail.secondaryIndex,
      } as const)
    : ({ kind: 'enchant', creatureId, gearId, enchantId: detail.enchantId } as const);
}
