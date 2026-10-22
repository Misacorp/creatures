import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { baitCount } from './count-items';
import type { SendRequest } from './expedition-api';
import { ExplorerPicker } from './ExplorerPicker';
import { HaulStrip } from './HaulStrip';
import { LengthPicker } from './LengthPicker';
import { Sprite } from './sprites/Sprite';
import { SupplyPicker } from './SupplyPicker';
import { TreatBox } from './TreatBox';
import { lengthLabel } from './trip-view';
import { TripSummary } from './TripSummary';
import { BagFullNote } from './ui/BagFullNote';
import { CountBadge } from './ui/CountBadge';
import { WizardFooter } from './ui/Wizard';
import type { GearState } from './gear-types';
import type { SendForm as SendFormState } from './use-send-form';
import type { Forecast } from './weather-types';

const TIME_GLYPH = { night: 'moon', festival: 'flag' } as const;

/** Sends the form's request; when the trip started, the supplies and the treat are put down. */
function sendNow(
  form: SendFormState,
  onSend: (request: SendRequest) => Promise<boolean>,
): Promise<void> {
  if (form.request === null) return Promise.resolve();
  return onSend(form.request).then((started) => {
    if (started) form.reset();
  });
}

/**
 * The pinned footer of the send flow: `ui/WizardFooter` with what is the trip's own: the place's time rule
 * when it is shut ("Opens tonight at 20:00") above the reason, the full bag warning under it, the label
 * "Send Mossy to Tidepools for 12 h" and a packed treat's Bait badge. It is the wizard's footer: Next on the
 * first steps, the send on the last; it goes in the frame's pinned footer (the sheet's or the panel's).
 */
export function SendFooter({
  form,
  busy,
  onSend,
  bag = null,
  onOpenWorkshop,
}: {
  form: SendFormState;
  busy: boolean;
  onSend: (request: SendRequest) => Promise<boolean>;
  /** The bag's fill; a full bag warns, beside Send, that the trip's gear becomes parts. */
  bag?: GearState['inventory'] | null;
  /** Opens the Workshop (the full bag warning's shortcut). */
  onOpenWorkshop?: (() => void) | undefined;
}) {
  const wizard = form.wizard;
  const sending = wizard.last;
  const reason = sending ? form.blocker : form.stepBlocker;
  const rule = form.place?.timeRule ?? null;
  const { explorer, place } = form;
  return (
    <WizardFooter
      wizard={wizard}
      blocked={reason}
      busy={busy}
      disabled={sending && form.request === null}
      reasonShown={reason !== rule?.text}
      {...(sending
        ? {
            label:
              explorer === undefined || place === undefined
                ? 'Send'
                : `Send ${explorer.name} to ${place.name} for ${lengthLabel(form.length)}`,
            onFinish: () => {
              void sendNow(form, onSend);
            },
          }
        : {})}
      before={
        sending &&
        rule !== null && (
          <p class="time-rule send-rule" role="status">
            <Sprite sprite={glyphOrUnknown(TIME_GLYPH[rule.kind])} scale={2} />
            <span>{rule.text}</span>
          </p>
        )
      }
      extra={sending && <BagFullNote inventory={bag} onOpenWorkshop={onOpenWorkshop} />}
      /* A packed treat's Bait, on the button that spends it (the trip itself is free). */
      badge={sending && form.treat && <CountBadge {...baitCount(form.treatCost)} label="Bait" />}
    />
  );
}

function WhoSection({ form }: { form: SendFormState }) {
  return (
    <ExplorerPicker
      name="send-explorer"
      options={form.options}
      value={form.explorer?.creature.id ?? null}
      onChange={form.pickExplorer}
      compact
    />
  );
}

function PackSection({
  form,
  busy,
  onOpenWorkshop,
}: {
  form: SendFormState;
  busy: boolean;
  onOpenWorkshop: (() => void) | undefined;
}) {
  const { explorer } = form;
  return (
    <>
      <h4 class="step">How long</h4>
      <LengthPicker
        name="send-length"
        rank={form.rank}
        value={form.length}
        onChange={form.setLength}
      />
      <div class="step-row">
        <h4 class="step">
          Supplies <GlossaryTag entry="supplies" look="help" />
        </h4>
        {onOpenWorkshop !== undefined && (
          <button
            type="button"
            class="step-craft"
            aria-label="Craft supplies in the Workshop"
            onClick={onOpenWorkshop}
          >
            <Sprite sprite={glyphOrUnknown('anvil')} scale={2} />
            Craft
          </button>
        )}
      </div>
      <SupplyPicker picks={form.picks} stock={form.stock} onChange={form.setPicks} />
      {explorer !== undefined && (
        <TreatBox
          cost={form.treatCost}
          bait={form.bait}
          checked={form.treat}
          disabled={busy}
          who={explorer.name}
          onChange={form.setTreat}
        />
      )}
    </>
  );
}

function ReadySection({ form, forecast }: { form: SendFormState; forecast: Forecast | null }) {
  const { explorer, place } = form;
  return (
    <div class="send-summary">
      <HaulStrip
        length={form.length}
        element={form.element}
        kit={form.picks.map((p) => p.id)}
        trip={form.trip}
        rank={explorer === undefined ? null : form.rank}
        summary={
          <TripSummary
            duration={lengthLabel(form.length)}
            place={place?.name ?? null}
            explorer={explorer?.name ?? null}
            supplies={form.picks.map((p) => p.id)}
            treat={form.treat}
            now={form.now}
            endsAt={form.endsAt}
            timezone={form.timezone}
            boon={forecast?.today?.boon ?? null}
            omen={forecast?.today?.omen ?? null}
            twist={place?.twist ?? null}
          />
        }
      />
    </div>
  );
}

/**
 * The send form for a fixed place (the place was chosen on the map), as wizard steps: who goes, then how
 * long and which supplies and treat, then the summary and the expected haul. It draws only the section of
 * `form.step`, with no heading and no button: the caller puts a `WizardView` (`form.wizard`) around it and
 * `<SendFooter />` in its frame's pinned footer. The state is `useSendForm`'s, kept by the caller.
 */
export function SendForm({
  form,
  busy,
  forecast = null,
  onOpenWorkshop,
}: {
  form: SendFormState;
  busy: boolean;
  /** The valley sky; today's Boon and Omen show in the summary when they touch trips. */
  forecast?: Forecast | null;
  /** Opens the Workshop, where supplies are crafted. */
  onOpenWorkshop?: (() => void) | undefined;
}) {
  return (
    <div class="send-form steps">
      {form.step === 'who' && <WhoSection form={form} />}
      {form.step === 'pack' && (
        <PackSection form={form} busy={busy} onOpenWorkshop={onOpenWorkshop} />
      )}
      {form.step === 'ready' && <ReadySection form={form} forecast={forecast} />}
    </div>
  );
}
