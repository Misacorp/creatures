import type { Creature } from '../api';
import { creatureV2, plainText, talentViewOf } from '../combat-v2-view';
import { usePopoverTrigger } from '../PopoverHost';
import { PopoverCard } from '../ui/Popover';
import type { TalentView } from '../talent-types';
import type { TalentSlotView } from '../talent-types';
import { GoldenMark } from '../TalentChip';
import { talentTextParts } from '../talent-view';
import { Slot, SlotRow } from '../ui/Slot';

/** The signature talent's popover: its name, its effect, its plain sentence, then what a signature is. */
function SignatureCard({ talent }: { talent: TalentView }) {
  return (
    <PopoverCard
      title={talent.name}
      short={talent.text}
      lines={[talent.about]}
      note="Signature talent: always on. It comes with the species and never changes."
    />
  );
}

/**
 * A talent in a slot: its name, and under it the number ("+14%"). A golden one shimmers like a golden TalentChip.
 * `numberOnly` (combat v2, whose texts are whole sentences): only a percentage stands under the name; a talent without one shows its name alone.
 */
export function TalentInSlot({
  talent,
  numberOnly = false,
}: {
  talent: TalentView;
  numberOnly?: boolean;
}) {
  const parts = talentTextParts(talent.text);
  // A phrase without a number (a rule talent) shows its words instead.
  // (A number that is no share, like "+0.1" of "+0.1x on crits", would mislead on its own: only a percentage stands in a slot.)
  const value = numberOnly
    ? parts.value !== null && parts.value.endsWith('%')
      ? parts.value
      : ''
    : (parts.value ?? talent.text);
  return (
    <span
      class={`talent-chip slot-talent${numberOnly ? ' compact' : ''}${talent.golden ? ' golden' : ''}${talent.idle ? ' idle' : ''}`}
    >
      <strong class="talent-name pix">{talent.name}</strong>
      {talent.golden && <GoldenMark />}
      {value !== '' && (
        <span class="slot-talent-value pix">
          {talent.golden && parts.value !== null ? (
            <span class="gold-shimmer">{value}</span>
          ) : (
            value
          )}
        </span>
      )}
    </span>
  );
}

/**
 * A creature's talent slots, the same Slot as the gear's and side by side across the full width (two,
 * or three for a rare or epic). Filled: the talent's name and number. Open and empty: "Talent". Not open
 * yet: the level it opens at. An epic's signature talent stands first and is always on; tapping it opens a
 * popover that says what it does. Tapping an open slot asks for the Talent Book.
 */
export function TalentSlots({
  creature,
  openSlot,
  onOpen,
}: {
  creature: Creature;
  /** The talent slot whose book is open now. */
  openSlot: number | null;
  onOpen: (slot: number, button: HTMLButtonElement) => void;
}) {
  // Combat v2 (the server's flag): the slots are the v2 ones, whole-sentence talents show name and number only, and
  // there is no signature talent.
  const v2 = creatureV2(creature);
  const slots: readonly TalentSlotView[] =
    v2 === null
      ? creature.talents.slots
      : v2.talentsV2.slots.map((s) => ({
          ...s,
          talent: s.talent === null ? null : talentViewOf(s.talent),
        }));
  const signature = v2 === null ? creature.talents.signature : null;
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  return (
    <SlotRow
      label="Talents"
      slots={[
        ...(signature === null
          ? []
          : [
              <Slot
                key="signature"
                kind="talent"
                state="filled"
                corner="Signature"
                label={`Signature talent: ${signature.name}, ${signature.text}. What it does`}
                {...(host === null
                  ? {}
                  : {
                      buttonRef: ref,
                      expanded: open,
                      onClick: () => {
                        if (ref.current === null) return;
                        host.openCustom(`signature:${creature.id}`, ref.current, {
                          label: `Signature talent: ${signature.name}`,
                          body: <SignatureCard talent={signature} />,
                        });
                      },
                    })}
              >
                <TalentInSlot talent={signature} />
              </Slot>,
            ]),
        ...slots.map((slot) => {
          if (!slot.open) {
            return (
              <Slot
                key={slot.slot}
                kind="talent"
                state="locked"
                name="Talent"
                opensAt={slot.opensAt}
                label={`Talent slot ${String(slot.slot)}: opens at level ${String(slot.opensAt)}`}
              />
            );
          }
          const open = (event: MouseEvent): void => {
            onOpen(slot.slot, event.currentTarget as HTMLButtonElement);
          };
          return slot.talent === null ? (
            <Slot
              key={slot.slot}
              kind="talent"
              state="empty"
              name="Talent"
              label={`Talent slot ${String(slot.slot)}: empty. Open the Talent Book`}
              expanded={openSlot === slot.slot}
              onClick={open}
            />
          ) : (
            <Slot
              key={slot.slot}
              kind="talent"
              state="filled"
              label={`Talent slot ${String(slot.slot)}: ${slot.talent.name}, ${plainText(slot.talent.text)}${slot.talent.golden ? ', golden' : ''}. Change`}
              expanded={openSlot === slot.slot}
              onClick={open}
            >
              <TalentInSlot talent={slot.talent} numberOnly={v2 !== null} />
            </Slot>
          );
        }),
      ]}
    />
  );
}
