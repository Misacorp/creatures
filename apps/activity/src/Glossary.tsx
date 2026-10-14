import { content, entryView } from '@creatures/game';
import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  backLabel,
  goBack,
  onEscape,
  openTag,
  toggleCreature,
  type ActiveCreature,
  type CreatureInfo,
  type PopView,
} from './creature-popover';
import { ElementChip } from './sprites/ElementChip';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import {
  MORE_LABEL,
  TAG_ATTRIBUTE,
  resolveTag,
  tagKey,
  toggleTag,
  visualPlan,
  type ActiveTag,
  type TagRef,
} from './glossary-ui';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { StagePopover } from './StagePopover';
import type { GlossarySection, GlossaryView } from '@creatures/game';

interface GlossaryApi {
  active: ActiveTag<HTMLElement> | null;
  toggle: (ref: TagRef, anchor: HTMLElement) => void;
  close: () => void;
  /** The small creature whose popover is open, if any. */
  creature: ActiveCreature<HTMLElement> | null;
  toggleCreature: (key: string, info: CreatureInfo, anchor: HTMLElement) => void;
}

const GlossaryContext = createContext<GlossaryApi | null>(null);

/** The provider's api, or null outside one (tags and small creatures are then plain). */
export function useGlossary(): GlossaryApi | null {
  return useContext(GlossaryContext);
}

const reactionById = (id: string) => content.reactions.find((r) => r.id === id);

/** The little picture at the top of a popover: sprites the game already has, never text. */
function PopoverVisual({ view }: { view: GlossaryView }) {
  const items = visualPlan(view.visual, reactionById);
  if (items.length === 0) return null;
  return (
    <div class="gp-visual" aria-hidden="true">
      {items.map((item, i) =>
        item.kind === 'arrow' ? (
          <Sprite key={i} sprite={glyphOrUnknown('left_to_right')} scale={3} class="gp-arrow" />
        ) : (
          <Sprite
            key={i}
            sprite={item.sprite}
            scale={item.scale}
            {...(item.palette === undefined ? {} : { palette: item.palette })}
          />
        ),
      )}
    </div>
  );
}

/** A glossary entry's picture, title, short text, lines and the link to How to play. */
function GlossaryBody({
  view,
  onMore,
}: {
  view: GlossaryView;
  onMore: (section: GlossarySection) => void;
}) {
  return (
    <div class="gp-body">
      <PopoverVisual view={view} />
      <p class="gp-title pix">{view.title}</p>
      <p class="gp-short">{view.short}</p>
      {view.lines.length > 0 && (
        <ul class="gp-lines">
          {view.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        class="gp-more"
        onClick={() => {
          onMore(view.section);
        }}
      >
        {MORE_LABEL}
      </button>
    </div>
  );
}

/** Closes a popover when the thing it points at has left the page (a list drew again, a screen changed). */
function useCloseWhenGone(anchor: HTMLElement, onClose: () => void): void {
  useEffect(() => {
    const timer = setInterval(() => {
      if (!anchor.isConnected) onClose();
    }, 400);
    return () => {
      clearInterval(timer);
    };
  }, [anchor]);
}

function GlossaryPopover({
  active,
  onClose,
  onMore,
}: {
  active: ActiveTag<HTMLElement>;
  onClose: () => void;
  onMore: (section: GlossarySection) => void;
}) {
  const view = resolveTag(active.ref);
  useCloseWhenGone(active.anchor, onClose);
  if (view === undefined) return null;
  return (
    <div class="glossary-layer">
      <StagePopover
        key={active.key}
        class="gloss-pop"
        anchor={() => active.anchor}
        label={view.title}
        onClose={onClose}
      >
        <GlossaryBody view={view} onMore={onMore} />
      </StagePopover>
    </div>
  );
}

/**
 * The popover of a small creature: its name, level, role and element as tags. Tapping a tag
 * switches this same popover to that glossary entry (the content a tag shows anywhere else), with a
 * back control; Escape goes back first and then closes. The two faces are `creature-popover.ts`.
 */
function CreaturePopover({
  active,
  onView,
  onClose,
  onMore,
}: {
  active: ActiveCreature<HTMLElement>;
  onView: (view: PopView) => void;
  onClose: () => void;
  onMore: (section: GlossarySection) => void;
}) {
  const { info, view } = active;
  useCloseWhenGone(active.anchor, onClose);
  const entry = view.kind === 'tag' ? entryView(view.entry) : undefined;
  // An entry the content does not know shows the creature instead.
  const face = entry === undefined ? 'creature' : 'tag';
  return (
    <div class="glossary-layer">
      <StagePopover
        key={`${face}:${entry?.title ?? ''}`}
        class="gloss-pop creature-pop"
        anchor={() => active.anchor}
        label={entry === undefined ? `${info.name}, level ${String(info.level)}` : entry.title}
        onClose={onClose}
        onEscape={() => {
          const next = onEscape(view);
          if (next.close) onClose();
          else onView(next.view);
        }}
      >
        {entry === undefined ? (
          <div class="gp-body cp-body">
            <div class="gp-visual" aria-hidden="true">
              <Sprite sprite={creatureSpriteOrFallback(info.species)} scale={4} />
            </div>
            <p class="gp-title pix">{info.name}</p>
            <p class="gp-short">Level {info.level}</p>
            <p class="tags cp-tags">
              <ElementChip
                as="button"
                element={info.element}
                role={info.role}
                onOpen={(entry) => {
                  onView(openTag(entry));
                }}
              />
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              class="cp-back"
              aria-label={backLabel(info)}
              onClick={() => {
                onView(goBack());
              }}
            >
              <Sprite sprite={glyphOrUnknown('left_to_right')} scale={2} class="cp-back-arrow" />
              <span class="pix">{info.name}</span>
            </button>
            <GlossaryBody view={entry} onMore={onMore} />
          </>
        )}
      </StagePopover>
    </div>
  );
}

/**
 * Holds the one open glossary popover of the app and draws it above everything (a fixed layer, so
 * it works on any page and over the How to play overlay). `onOpenHowTo` is what the popover's
 * "More in How to play" link does: the app opens the page at that section.
 */
export function GlossaryProvider({
  onOpenHowTo,
  children,
}: {
  onOpenHowTo: (section: GlossarySection) => void;
  children: ComponentChildren;
}) {
  const [active, setActive] = useState<ActiveTag<HTMLElement> | null>(null);
  const [creature, setCreature] = useState<ActiveCreature<HTMLElement> | null>(null);
  // One popover at a time: opening one of the two kinds closes the other.
  const api = useMemo<GlossaryApi>(
    () => ({
      active,
      toggle: (ref, anchor) => {
        setCreature(null);
        setActive((current) => toggleTag(current, { key: tagKey(ref), ref, anchor }));
      },
      close: () => {
        setActive(null);
        setCreature(null);
      },
      creature,
      toggleCreature: (key, info, anchor) => {
        setActive(null);
        setCreature((current) => toggleCreature(current, { key, info, anchor }));
      },
    }),
    [active, creature],
  );
  return (
    <GlossaryContext.Provider value={api}>
      {children}
      {active !== null && (
        <GlossaryPopover
          active={active}
          onClose={api.close}
          onMore={(section) => {
            setActive(null);
            onOpenHowTo(section);
          }}
        />
      )}
      {creature !== null && (
        <CreaturePopover
          active={creature}
          onView={(view) => {
            setCreature((current) => (current === null ? null : { ...current, view }));
          }}
          onClose={api.close}
          onMore={(section) => {
            setCreature(null);
            onOpenHowTo(section);
          }}
        />
      )}
    </GlossaryContext.Provider>
  );
}

type TagProps = (
  { entry: string; ability?: undefined } | { ability: string; entry?: undefined }
) & {
  /**
   * `text`: a dotted underline under the words. `chip`: the element is already a pixel chip or tag
   * (give it the chip's own classes with `class`), and gets a small "?" after its text. `help`: a
   * tiny "?" button on its own, for things that are buttons themselves (children are ignored).
   */
  look?: 'text' | 'chip' | 'help';
  /** What assistive technology says instead of the visible text. */
  label?: string;
  /** With `look="chip"`: a tag without the "?" (a mark, a modifier icon, a streak). */
  bare?: boolean;
  class?: string;
  children?: ComponentChildren;
};

/**
 * A tag that explains itself: tapping it (or Enter or Space) opens a popover with a short text, a
 * picture and a link to the How to play page; Escape or a tap elsewhere closes it. It is a real
 * button, so it never takes part in drag and drop (the drag code ignores presses that start on a
 * tag), and it must not be placed inside another button. Without a provider, or for an id the
 * content does not know, it is plain text.
 */
export function GlossaryTag(props: TagProps) {
  const api = useContext(GlossaryContext);
  const ref = useRef<HTMLButtonElement>(null);
  const target: TagRef =
    props.ability === undefined ? { entry: props.entry } : { ability: props.ability };
  const view = resolveTag(target);
  const look = props.look ?? 'text';
  const plainClass = props.class;
  if (api === null || view === undefined) {
    return look === 'help' ? null : <span class={plainClass}>{props.children}</span>;
  }
  const open = api.active !== null && api.active.anchor === ref.current;
  const classes = [
    'gtag',
    look === 'text' ? '' : `gtag-${look}`,
    look === 'chip' && props.bare === true ? 'gtag-bare' : '',
    plainClass ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const label = props.label ?? (look === 'help' ? `What is ${view.title}?` : undefined);
  const attributes = { [TAG_ATTRIBUTE]: '' };
  return (
    <button
      ref={ref}
      type="button"
      class={classes}
      aria-haspopup="dialog"
      aria-expanded={open}
      {...(label === undefined ? {} : { 'aria-label': label })}
      {...attributes}
      onClick={() => {
        if (ref.current !== null) api.toggle(target, ref.current);
      }}
    >
      {look === 'help' ? '?' : props.children}
    </button>
  );
}
