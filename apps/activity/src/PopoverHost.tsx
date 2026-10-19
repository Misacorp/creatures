import { content, entryView } from '@creatures/game';
import type { GlossarySection, GlossaryView } from '@creatures/game';
import { createContext, type ComponentChildren, type RefObject } from 'preact';
import { useContext, useMemo, useRef, useState } from 'preact/hooks';
import { backLabel, creatureFacts, shownWornItems, type CreatureInfo } from './creature-info';
import { bossArt, shinyPalette } from './art';
import type { FoeInfo } from './foe-info';
import { speciesName } from './game';
import { glyphOrUnknown } from './glyphs';
import { compactCount } from './number-format';
import { MORE_LABEL, resolveTag, tagKey, visualPlan, type TagRef } from './glossary-ui';
import { WornItemLines } from './WornItemLines';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Popover, PopoverBack, PopoverCard } from './ui/Popover';
import { toggleActive, usePopoverNav } from './ui/popover-nav';

/** What the open popover is about: a glossary entry or ability, a small creature, or anything else. */
type OpenPopover = { key: string; anchor: HTMLElement } & (
  | { kind: 'tag'; ref: TagRef }
  | { kind: 'creature'; info: CreatureInfo; action?: CreatureAction }
  | { kind: 'foe'; info: FoeInfo }
  | { kind: 'custom'; label: string; body: ComponentChildren }
);

/** A button under a creature's popover (the raid board's "Remove from board"). It closes the popover first. */
export interface CreatureAction {
  label: string;
  onAct: () => void;
}

export interface PopoverHostApi {
  /** The element whose popover is open, if any: a trigger says `aria-expanded` when it is this one. */
  anchor: HTMLElement | null;
  /** A tap on a tag: opens its glossary popover, or closes it when that tag's is open. */
  openTag: (ref: TagRef, anchor: HTMLElement) => void;
  /**
   * A tap on a small creature: opens its popover (on the creature face), or closes it. `action` adds
   * a button under the facts.
   */
  openCreature: (
    key: string,
    info: CreatureInfo,
    anchor: HTMLElement,
    action?: CreatureAction,
  ) => void;
  /**
   * A tap on the foe or boss on the fight stage: opens its popover (name, element, HP and what it
   * does, from the content), or closes it. Like a creature's, the element chip switches the same
   * popover to its glossary entry.
   */
  openFoe: (key: string, info: FoeInfo, anchor: HTMLElement) => void;
  /** A tap on anything else that explains itself: opens a popover with this content, or closes it. */
  openCustom: (
    key: string,
    anchor: HTMLElement,
    popover: { label: string; body: ComponentChildren },
  ) => void;
  close: () => void;
}

const PopoverHostContext = createContext<PopoverHostApi | null>(null);

/** The host's api, or null outside one (tags and small creatures are then plain). */
export function usePopoverHost(): PopoverHostApi | null {
  return useContext(PopoverHostContext);
}

/**
 * What a button that opens a popover from the host needs: the host, a ref for the button, and
 * whether the host's popover is the one of this very button (`open`, for `aria-expanded`).
 */
export function usePopoverTrigger<E extends HTMLElement>(): {
  host: PopoverHostApi | null;
  ref: RefObject<E | null>;
  open: boolean;
} {
  const host = usePopoverHost();
  const ref = useRef<E>(null);
  return { host, ref, open: host?.anchor != null && host.anchor === ref.current };
}

const reactionById = (id: string) => content.reactions.find((r) => r.id === id);

/** The little picture at the top of a glossary popover: sprites the game already has, never text. */
function glossaryVisual(view: GlossaryView): ComponentChildren {
  const items = visualPlan(view.visual, reactionById);
  if (items.length === 0) return null;
  return items.map((item, i) =>
    item.kind === 'arrow' ? (
      <Sprite key={i} sprite={glyphOrUnknown('left_to_right')} scale={3} />
    ) : (
      <Sprite
        key={i}
        sprite={item.sprite}
        scale={item.scale}
        {...(item.palette === undefined ? {} : { palette: item.palette })}
      />
    ),
  );
}

/** A glossary entry's picture, title, short text, lines and the link to How to play. */
function GlossaryCard({
  view,
  onMore,
}: {
  view: GlossaryView;
  onMore: (section: GlossarySection) => void;
}) {
  return (
    <PopoverCard
      visual={glossaryVisual(view)}
      title={view.title}
      short={view.short}
      lines={view.lines}
      more={{
        label: MORE_LABEL,
        onMore: () => {
          onMore(view.section);
        },
      }}
    />
  );
}

function TagPopover({
  open,
  onClose,
  onMore,
}: {
  open: OpenPopover & { kind: 'tag' };
  onClose: () => void;
  onMore: (section: GlossarySection) => void;
}) {
  const view = resolveTag(open.ref);
  if (view === undefined) return null;
  return (
    <Popover
      key={open.key}
      layer="page"
      anchor={() => open.anchor}
      label={view.title}
      onClose={onClose}
    >
      <GlossaryCard view={view} onMore={onMore} />
    </Popover>
  );
}

/**
 * The popover of a small creature: its picture with its name, level, role and element tags beside it,
 * then its facts and worn item below. Tapping a tag
 * switches this same popover to that glossary entry (the content a tag shows anywhere else), with
 * a back control; Escape goes back first and then closes. The faces are the creature itself
 * (`null`) and one glossary entry (its id).
 */
function CreaturePopover({
  open,
  onClose,
  onMore,
}: {
  open: OpenPopover & { kind: 'creature' };
  onClose: () => void;
  onMore: (section: GlossarySection) => void;
}) {
  const { info } = open;
  const worn = shownWornItems(info);
  const nav = usePopoverNav<string | null>(null, open);
  const entry = nav.view === null ? undefined : entryView(nav.view);
  // An entry the content does not know shows the creature instead.
  const face = entry === undefined ? 'creature' : 'tag';
  return (
    <Popover
      key={`${face}:${entry?.title ?? ''}`}
      layer="page"
      anchor={() => open.anchor}
      label={entry === undefined ? `${info.name}, level ${String(info.level)}` : entry.title}
      onClose={onClose}
      nav={nav}
    >
      {entry === undefined ? (
        <PopoverCard
          visual={
            <Sprite
              sprite={creatureSpriteOrFallback(info.species)}
              scale={4}
              {...(info.shiny === true && shinyPalette(info.species) !== undefined
                ? { palette: shinyPalette(info.species) as Readonly<Record<string, string>> }
                : {})}
            />
          }
          title={info.name}
          short={`Level ${String(info.level)}`}
          lines={creatureFacts(info, speciesName(info.species))}
          beside={
            <p class="tags pop-tags">
              <ElementChip
                as="button"
                element={info.element}
                role={info.role}
                onOpen={(id) => {
                  nav.open(id);
                }}
              />
            </p>
          }
        >
          {worn.length > 0 && <WornItemLines worn={worn} />}
          {open.action !== undefined && (
            <button
              type="button"
              class="pop-action"
              onClick={() => {
                onClose();
                open.action?.onAct();
              }}
            >
              {open.action.label}
            </button>
          )}
        </PopoverCard>
      ) : (
        <>
          <PopoverBack label={backLabel(info)} onBack={nav.back}>
            {info.name}
          </PopoverBack>
          <GlossaryCard view={entry} onMore={onMore} />
        </>
      )}
    </Popover>
  );
}

/**
 * The popover of the foe or boss on the fight stage, built like a creature's: its picture with its
 * name, HP and element chip beside it, then a line about it and what it does. The element chip
 * switches this same popover to that glossary entry, with a back control.
 */
function FoePopover({
  open,
  onClose,
  onMore,
}: {
  open: OpenPopover & { kind: 'foe' };
  onClose: () => void;
  onMore: (section: GlossarySection) => void;
}) {
  const { info } = open;
  const nav = usePopoverNav<string | null>(null, open);
  const entry = nav.view === null ? undefined : entryView(nav.view);
  const face = entry === undefined ? 'foe' : 'tag';
  const art = bossArt(info.id);
  return (
    <Popover
      key={`${face}:${entry?.title ?? ''}`}
      layer="page"
      anchor={() => open.anchor}
      label={entry === undefined ? info.name : entry.title}
      onClose={onClose}
      nav={nav}
    >
      {entry === undefined ? (
        <PopoverCard
          visual={<Sprite sprite={art.sprite} scale={4} />}
          title={info.name}
          short={`HP ${compactCount(info.hp)}`}
          lines={info.moves}
          note={info.about}
          beside={
            <p class="tags pop-tags">
              <ElementChip
                as="button"
                element={info.element}
                context="boss"
                onOpen={(id) => {
                  nav.open(id);
                }}
              />
            </p>
          }
        />
      ) : (
        <>
          <PopoverBack label={backLabel(info)} onBack={nav.back}>
            {info.name}
          </PopoverBack>
          <GlossaryCard view={entry} onMore={onMore} />
        </>
      )}
    </Popover>
  );
}

/**
 * Holds the one open popover of the app (a glossary tag's, a small creature's, a boss icon's) and
 * draws it above everything (a fixed layer, so it works on any page and over the How to play
 * overlay). Opening one closes the other. `onOpenHowTo` is what the popover's "More in How to play"
 * link does: the app opens the page at that section. The popovers of the fight stage are not
 * here: they sit inside the stage (`Popover` with `layer="stage"`).
 */
export function PopoverHost({
  onOpenHowTo,
  children,
}: {
  onOpenHowTo: (section: GlossarySection) => void;
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState<OpenPopover | null>(null);
  const api = useMemo<PopoverHostApi>(
    () => ({
      anchor: open?.anchor ?? null,
      openTag: (ref, anchor) => {
        setOpen((current) => toggleActive(current, { kind: 'tag', key: tagKey(ref), anchor, ref }));
      },
      openCreature: (key, info, anchor, action) => {
        setOpen((current) =>
          toggleActive(current, {
            kind: 'creature',
            key,
            anchor,
            info,
            ...(action === undefined ? {} : { action }),
          }),
        );
      },
      openFoe: (key, info, anchor) => {
        setOpen((current) => toggleActive(current, { kind: 'foe', key, anchor, info }));
      },
      openCustom: (key, anchor, popover) => {
        setOpen((current) => toggleActive(current, { kind: 'custom', key, anchor, ...popover }));
      },
      close: () => {
        setOpen(null);
      },
    }),
    [open],
  );
  const onMore = (section: GlossarySection): void => {
    setOpen(null);
    onOpenHowTo(section);
  };
  return (
    <PopoverHostContext.Provider value={api}>
      {children}
      {open?.kind === 'tag' && <TagPopover open={open} onClose={api.close} onMore={onMore} />}
      {open?.kind === 'creature' && (
        <CreaturePopover open={open} onClose={api.close} onMore={onMore} />
      )}
      {open?.kind === 'foe' && <FoePopover open={open} onClose={api.close} onMore={onMore} />}
      {open?.kind === 'custom' && (
        <Popover
          key={open.key}
          layer="page"
          anchor={() => open.anchor}
          label={open.label}
          onClose={api.close}
        >
          {open.body}
        </Popover>
      )}
    </PopoverHostContext.Provider>
  );
}
