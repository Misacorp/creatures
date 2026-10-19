/**
 * The live stage's ability hand: the caller's own abilities with what their badges say, which
 * popover is open (an ability's, a creature's note or the "?" help) and the anchors those popovers
 * hang from. The fight screens give the abilities; the stage only draws.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { abilityControls } from './live';
import type { LiveAbility, LiveFight } from './live-api';
import type { ReplayRowEntry } from './raid-api';
import type { AbilityUse } from './stage';
import { badgeFor, type Badge } from './stage-abilities';

/** What the live stage needs to put the player's abilities on their creatures. */
export interface StageAbilities {
  /** Every ability of the fight (the caller's own and the others'). */
  list: readonly LiveAbility[];
  /** The caller's player key in this fight. */
  you: string | null;
  /** The fight's status, round and round count, which decide whether Fire is on offer. */
  fight: Pick<LiveFight, 'status' | 'round' | 'rounds'>;
  /**
   * The popover's content for one of the caller's abilities (a creature's, or the basic one on the
   * chip). `badge` is what the stage shows for it; `close` shuts the popover.
   */
  renderPopover: (ability: LiveAbility, badge: Badge, close: () => void) => ComponentChildren;
  /**
   * The popover of one of the caller's creatures that has no ability in this fight (below the unlock
   * level, say). Without it such a creature is not a button.
   */
  renderNote?: (creature: ReplayRowEntry, close: () => void) => ComponentChildren;
  /** The text of the "?" button's popover (how abilities work). Without it there is no button. */
  help?: ComponentChildren;
}

export function useStageAbilities(args: {
  abilities: StageAbilities | undefined;
  row: readonly ReplayRowEntry[];
  /** The abilities that have been played so far, by key. */
  useByKey: ReadonlyMap<string, AbilityUse>;
}) {
  const { abilities, row, useByKey } = args;
  /** Which popover is open: "a:<ability key>" for an ability, "c:<creature id>" for a note, "help" for the "?" button's. */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const anchors = useRef(new Map<string, HTMLElement>());
  const anchorRef = (id: string) => (el: HTMLElement | null) => {
    if (el === null) anchors.current.delete(id);
    else anchors.current.set(id, el);
  };

  // The caller's own abilities, with what the badge says and whether Fire or Auto fire is on offer.
  const own =
    abilities === undefined || abilities.you === null
      ? []
      : abilities.list.filter((a) => a.alias === abilities.you);
  const ownInfo = (ability: LiveAbility): { badge: Badge; actionable: boolean } => {
    const controls = abilities === undefined ? null : abilityControls(abilities.fight, ability);
    return {
      badge: badgeFor(ability, useByKey.get(ability.key) ?? null, controls?.canFire ?? false),
      actionable: controls !== null && (controls.canFire || controls.canToggle),
    };
  };
  const basics = own.filter((a) => a.creature === null);
  const openAbility =
    openKey?.startsWith('a:') === true ? own.find((a) => `a:${a.key}` === openKey) : undefined;
  const openActionable = openAbility === undefined ? false : ownInfo(openAbility).actionable;
  const openNote =
    openKey?.startsWith('c:') === true ? row.find((c) => `c:${c.id}` === openKey) : undefined;

  // The popover closes by itself when its ability goes away, or when it was open on an ability
  // that could be used and no longer can be (the round moved on). A read-only popover (an ability
  // that was already used or pressed when it was opened) stays until it is dismissed.
  const seen = useRef<{ key: string | null; actionable: boolean }>({
    key: null,
    actionable: false,
  });
  useEffect(() => {
    const before = seen.current;
    seen.current = { key: openKey, actionable: openActionable };
    if (openKey === null) return;
    if (openKey.startsWith('c:')) {
      if (openNote === undefined) setOpenKey(null);
      return;
    }
    if (!openKey.startsWith('a:')) return;
    if (
      openAbility === undefined ||
      (before.key === openKey && before.actionable && !openActionable)
    ) {
      setOpenKey(null);
    }
  }, [openKey, openActionable, openAbility === undefined, openNote === undefined]);

  const close = (): void => {
    setOpenKey(null);
  };
  const toggle = (key: string): void => {
    setOpenKey(openKey === key ? null : key);
  };

  return {
    own,
    ownInfo,
    basics,
    openKey,
    openAbility,
    openNote,
    anchors,
    anchorRef,
    close,
    toggle,
  };
}
