import { useRef, useState } from 'preact/hooks';
import type { Creature } from '../api';
import { plainText, savedKnack, type CreatureV2 } from '../combat-v2-view';
import { creatureName } from '../game';
import { Alert } from '../ui/Alert';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { Drawer } from '../ui/Drawer';
import { KeywordText } from '../ui/KeywordText';
import { Slot, SlotRow } from '../ui/Slot';

/** What saving a Knack came to: it is saved, the creature has fought this weekend (a locked answer), or it did not work. */
export type KnackSaved = 'saved' | 'locked' | 'failed';

/** The words of a locked Knack: it has fought this weekend (R11). */
export const KNACK_LOCKED_TEXT = 'This creature has fought this weekend, so its Knack is locked.';

/**
 * The Knack picker, in a Drawer: the Knacks the creature knows, each with its name and its text (keywords as
 * chips), then "None". The saved one is ringed and checked. A pick saves right away (a free choice, no confirm):
 * the drawer closes when it is saved, and stays with a plain line when the creature is locked or the save failed.
 * Built on `ChoiceList`, the pattern of the camp's keepsakes.
 */
export function KnackPicker({
  open,
  onClose,
  creature,
  v2,
  busy,
  onPick,
  returnFocusTo,
  initialNote = null,
}: {
  open: boolean;
  onClose: () => void;
  creature: Creature;
  v2: CreatureV2;
  busy: boolean;
  /** Saves the pick (`null`: none) and says how it went. */
  onPick: (knack: string | null) => Promise<KnackSaved>;
  returnFocusTo?: HTMLElement | null | undefined;
  /** A note the drawer opens with (the workbench shows a locked one). */
  initialNote?: KnackSaved | null;
}) {
  const [note, setNote] = useState<KnackSaved | null>(initialNote);
  const [saving, setSaving] = useState(false);

  async function pick(knack: string | null): Promise<void> {
    setSaving(true);
    setNote(null);
    const result = await onPick(knack);
    setSaving(false);
    if (result === 'saved') onClose();
    else setNote(result);
  }

  const off = busy || saving;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Knack"
      meta={creatureName(creature)}
      class="knack-drawer"
      {...(returnFocusTo === undefined ? {} : { returnFocusTo })}
    >
      <div class="dr-stack pix-panel">
        <ChoiceList label="Knacks">
          {v2.knownKnacks.map((knack) => (
            <ChoiceButton
              key={knack.id}
              label={knack.name}
              line={<KeywordText text={knack.text} />}
              selected={v2.knack === knack.id}
              disabled={off}
              onClick={() => {
                void pick(knack.id);
              }}
            />
          ))}
          <ChoiceButton
            label="None"
            line="It fights without a Knack."
            selected={savedKnack(v2) === null}
            disabled={off}
            onClick={() => {
              void pick(null);
            }}
          />
        </ChoiceList>
        {note === 'locked' && <Alert level="warning">{KNACK_LOCKED_TEXT}</Alert>}
        {note === 'failed' && <Alert level="alert">That did not save. Try again.</Alert>}
      </div>
    </Drawer>
  );
}

/**
 * The Knack section's one slot (the page's, the raid configurator's): the saved Knack's name and text, or "None",
 * in the same box as a creature's talent slots, and a tap opens the picker. Without `onPick` it is read-only
 * (the raid is locked): the same box, not a button.
 */
export function KnackSection({
  creature,
  v2,
  busy,
  onPick,
  initialOpen = false,
  initialNote = null,
}: {
  creature: Creature;
  v2: CreatureV2;
  busy: boolean;
  /** Saves a pick; absent: the Knack can be seen and not changed. */
  onPick?: ((knack: string | null) => Promise<KnackSaved>) | undefined;
  /** The picker is open at the start (the workbench). */
  initialOpen?: boolean;
  initialNote?: KnackSaved | null;
}) {
  const [open, setOpen] = useState(initialOpen);
  const opener = useRef<HTMLButtonElement>(null);
  const saved = savedKnack(v2);
  const canPick = onPick !== undefined && v2.knownKnacks.length > 0;
  const label = saved === null ? 'Knack: none' : `Knack: ${saved.name}, ${plainText(saved.text)}`;
  const props = {
    kind: 'talent' as const,
    label: canPick ? `${label}. ${saved === null ? 'Choose one' : 'Change'}` : label,
    ...(canPick
      ? {
          buttonRef: opener,
          expanded: open,
          onClick: () => {
            setOpen(true);
          },
        }
      : {}),
  };
  return (
    <>
      <SlotRow
        label="Knack"
        slots={[
          saved === null ? (
            <Slot {...props} state="empty" name="None" />
          ) : (
            <Slot {...props} state="filled">
              <span class="knack-slot">
                <strong class="knack-name pix">{saved.name}</strong>
                <span class="knack-text prose">
                  <KeywordText text={saved.text} />
                </span>
              </span>
            </Slot>
          ),
        ]}
      />
      {canPick && open && (
        <KnackPicker
          open
          onClose={() => {
            setOpen(false);
          }}
          creature={creature}
          v2={v2}
          busy={busy}
          onPick={onPick}
          returnFocusTo={opener.current}
          initialNote={initialNote}
        />
      )}
    </>
  );
}
