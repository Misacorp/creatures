import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { baitCount } from './count-items';
import type { SendRequest } from './expedition-api';
import { ExplorerPicker } from './ExplorerPicker';
import { HaulStrip } from './HaulStrip';
import { LengthPicker } from './LengthPicker';
import type { SendStep } from './send-view';
import { Sprite } from './sprites/Sprite';
import { SupplyPicker } from './SupplyPicker';
import { TreatBox } from './TreatBox';
import { lengthLabel } from './trip-view';
import { TripSummary } from './TripSummary';
import { CountBadge } from './ui/CountBadge';
import type { SendForm as SendFormState } from './use-send-form';
import type { Forecast } from './weather-types';

/** The title of each wizard step and what Back goes back to (said only to screen readers). */
export const SEND_STEP_HEAD: Readonly<
  Record<SendStep, { title: string; backLabel: string; next: string }>
> = {
  who: { title: 'Who goes', backLabel: 'to the place', next: 'Next' },
  pack: { title: 'Pack up', backLabel: 'to who goes', next: 'Next' },
  ready: { title: 'Ready', backLabel: 'to packing up', next: 'Send' },
};

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
 * The pinned footer of the send flow: the reason the button is disabled (always visible, never a silent
 * grey button), the place's time rule when it is shut ("Opens tonight at 20:00") and the gold button.
 * `mode` is what the button does: `next` goes one step on, `send` sends the trip. The steps layout puts
 * this in the Drawer's `footer` slot with `mode` from the step (`SEND_STEP_HEAD[step].next`); the panel
 * layout draws it at the bottom of the form itself.
 */
export function SendFooter({
  form,
  mode,
  busy,
  onSend,
}: {
  form: SendFormState;
  mode: 'next' | 'send';
  busy: boolean;
  onSend: (request: SendRequest) => Promise<boolean>;
}) {
  const sending = mode === 'send';
  const reason = sending ? form.blocker : form.stepBlocker;
  const rule = form.place?.timeRule ?? null;
  const { explorer, place } = form;
  return (
    <div class="send-footer">
      {sending && rule !== null && (
        <p class="time-rule send-rule" role="status">
          <Sprite sprite={glyphOrUnknown(TIME_GLYPH[rule.kind])} scale={2} />
          <span>{rule.text}</span>
        </p>
      )}
      {reason !== null && reason !== rule?.text && (
        <p class="reason" role="status">
          {reason}
        </p>
      )}
      <button
        type="button"
        class="primary send-button"
        disabled={busy || reason !== null || (sending && form.request === null)}
        onClick={() => {
          if (sending) void sendNow(form, onSend);
          else form.next();
        }}
      >
        <span>
          {!sending
            ? 'Next'
            : explorer === undefined || place === undefined
              ? 'Send'
              : `Send ${explorer.name} to ${place.name} for ${lengthLabel(form.length)}`}
        </span>
        {/* A packed treat's Bait, on the button that spends it (the trip itself is free). */}
        {sending && form.treat && <CountBadge {...baitCount(form.treatCost)} label="Bait" />}
      </button>
    </div>
  );
}

function WhoSection({ form }: { form: SendFormState }) {
  return (
    <ExplorerPicker
      name="send-explorer"
      options={form.options}
      value={form.explorer?.creature.id ?? null}
      onChange={form.pickExplorer}
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
 * The send form for a fixed place (the place was chosen on the map): who goes, how long and which
 * supplies and treat, then the summary and the expected haul. The state is `useSendForm`'s, kept by the
 * caller so the sheet around it can read the step (for its `DrillHead` and footer).
 *
 * - `layout="steps"` (phone): draws only the section of `form.step`; no heading and no button. The
 *   caller puts `<DrillHead title={SEND_STEP_HEAD[step].title} backLabel=... onBack={form.back}/>` above
 *   it (not on Who, where the sheet's own close is) and `<SendFooter mode=... />` in the Drawer's
 *   `footer` slot.
 * - `layout="panel"` (desktop): all three sections stacked with their headings and the Send footer at
 *   the bottom; `form.step` is ignored.
 */
export function SendForm({
  form,
  layout,
  busy,
  forecast = null,
  onSend,
  onOpenWorkshop,
}: {
  form: SendFormState;
  layout: 'steps' | 'panel';
  busy: boolean;
  /** The valley sky; today's Boon and Omen show in the summary when they touch trips. */
  forecast?: Forecast | null;
  /** Sends the trip; resolves true when it started (the supplies are then put down). */
  onSend: (request: SendRequest) => Promise<boolean>;
  /** Opens the Workshop, where supplies are crafted. */
  onOpenWorkshop?: () => void;
}) {
  if (layout === 'steps') {
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
  return (
    <div class="send-form panel">
      <h4 class="step">
        <span class="step-n">1</span> {SEND_STEP_HEAD.who.title}
      </h4>
      <WhoSection form={form} />
      <h4 class="step">
        <span class="step-n">2</span> {SEND_STEP_HEAD.pack.title}
      </h4>
      <PackSection form={form} busy={busy} onOpenWorkshop={onOpenWorkshop} />
      <h4 class="step">
        <span class="step-n">3</span> {SEND_STEP_HEAD.ready.title}
      </h4>
      <ReadySection form={form} forecast={forecast} />
      <SendFooter form={form} mode="send" busy={busy} onSend={onSend} />
    </div>
  );
}
