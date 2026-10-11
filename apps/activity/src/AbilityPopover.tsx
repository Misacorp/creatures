import { content } from '@creatures/game';
import { elementName } from './game';
import { AutoFireToggle } from './AutoFireToggle';
import { abilityControls, abilityName, abilityParamKind } from './live';
import type { LiveAbility, LiveFight } from './live-api';
import { popoverStateLine, type Badge } from './stage-abilities';
import { Sprite } from './sprites/Sprite';
import { elementIcon } from './sprites/element-icons';

const ZONE_CHIPS = [
  { id: '', label: 'Default', spoken: 'Default: the zone the boss attacks first' },
  { id: 'front', label: 'Front', spoken: 'Front' },
  { id: 'middle', label: 'Middle', spoken: 'Middle' },
  { id: 'back', label: 'Back', spoken: 'Back' },
] as const;

interface ChipsProps {
  label: string;
  value: string;
  disabled: boolean;
  onPick: (value: string) => void;
  children: readonly {
    id: string;
    label: string;
    spoken: string;
    icon?: ReturnType<typeof elementIcon>;
  }[];
}

/** A row of small choice chips; exactly one is pressed. Used for the zone and the element. */
function Chips({ label, value, disabled, onPick, children }: ChipsProps) {
  return (
    <div class="ab-pick" role="group" aria-label={label}>
      <span class="ab-pick-label pix" aria-hidden="true">
        {label}
      </span>
      <div class="ab-chips">
        {children.map((chip) => (
          <button
            key={chip.id}
            type="button"
            class={value === chip.id ? 'pick-chip on' : 'pick-chip'}
            aria-pressed={value === chip.id}
            aria-label={chip.spoken}
            disabled={disabled}
            onClick={() => {
              onPick(chip.id);
            }}
          >
            {chip.icon !== undefined && <Sprite sprite={chip.icon} scale={1} />}
            <span>{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export interface AbilityPopoverBodyProps {
  fight: Pick<LiveFight, 'status' | 'round' | 'rounds'>;
  ability: LiveAbility;
  /** What the stage shows for this ability (it follows the events that have played). */
  badge: Badge;
  busy: boolean;
  zone: string;
  element: string;
  /** One short line, or null. */
  error: string | null;
  onZone: (zone: string) => void;
  onElement: (element: string) => void;
  onAct: (action: 'fire' | 'hold' | 'unhold') => void;
}

/**
 * The inside of an ability popover: the ability's name, one state line, the zone or element chips
 * when the ability asks for one, and two small buttons, Fire and Auto fire (a toggle). A button
 * that is no longer possible is left out, so a used or pressed ability shows only its state line.
 */
export function AbilityPopoverBody(props: AbilityPopoverBodyProps) {
  const { fight, ability, badge, busy } = props;
  const controls = abilityControls(fight, ability);
  const kind = abilityParamKind(ability.abilityId);
  return (
    <div class="ab-pop-body">
      <p class="ab-title pix">{abilityName(ability.abilityId)}</p>
      <p class="ab-state">{popoverStateLine(badge)}</p>
      {controls.canFire && kind === 'zone' && (
        <Chips label="Zone" value={props.zone} disabled={busy} onPick={props.onZone}>
          {ZONE_CHIPS}
        </Chips>
      )}
      {controls.canFire && kind === 'element' && (
        <Chips label="Element" value={props.element} disabled={busy} onPick={props.onElement}>
          {[
            { id: '', label: 'Default', spoken: 'Default element' },
            ...content.elements.map((e) => ({
              id: e.id,
              label: elementName(e.id),
              spoken: elementName(e.id),
              icon: elementIcon(e.id),
            })),
          ]}
        </Chips>
      )}
      {(controls.canFire || controls.canToggle) && (
        <div class="ab-buttons">
          {controls.canFire && (
            <button
              type="button"
              class="primary ab-fire"
              disabled={busy}
              onClick={() => {
                props.onAct('fire');
              }}
            >
              Fire
            </button>
          )}
          {controls.canToggle && (
            <AutoFireToggle
              on={controls.autoOn}
              disabled={busy}
              onToggle={(on) => {
                props.onAct(on ? 'unhold' : 'hold');
              }}
            />
          )}
        </div>
      )}
      {controls.note !== '' && !controls.canFire && <p class="ab-note">{controls.note}</p>}
      {props.error !== null && (
        <p class="ab-error" role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}
