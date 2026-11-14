/**
 * The roster preset picker of the "Give" section: a preset, who gets it (the panel's target player, or everyone) and a
 * confirmation typed in (the player's name, or "everyone") before Apply works. It replaces that player's creatures and
 * gear bag with the preset, on the server (`apply-roster-preset`, `apps/worker/src/dev-presets.ts`). The controls are
 * the panel's own (`dev-form`, `dev-field`, `dev-btn`); the players come from the panel's one read of
 * `GET /api/dev/players`, so the target the panel's picker names is the one shown here.
 */
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { presetLine, type PresetChoices } from './dev-api';

/** The picker's value for "everyone". */
const EVERYONE = 'everyone';
/** The picker's value for the panel's target player. */
const TARGET = 'target';

/** What must be typed to confirm: the picked player's name, or `everyone`. Case and outer spaces do not matter. */
export function confirmWord(choices: PresetChoices | null, target: string): string | null {
  if (target === EVERYONE) return EVERYONE;
  return choices?.players.find((p) => p.userId === target)?.name ?? null;
}

export function typedMatches(typed: string, word: string | null): boolean {
  return (
    word !== null &&
    typed.normalize('NFKC').trim().toLowerCase() === word.normalize('NFKC').trim().toLowerCase()
  );
}

/** The body of the tool for a picked target, preset and typed confirmation. */
export function presetBody(
  target: string,
  preset: string,
  confirm: string,
): Record<string, unknown> {
  return target === EVERYONE
    ? { preset, everyone: true, confirm }
    : { preset, userId: target, confirm };
}

interface Props {
  /** The guild's players and the presets (the panel reads them once and again after every tool). */
  choices: PresetChoices | null;
  /** The panel's target player (a user id; the caller's own when it says "You"). */
  target: string;
  busy: boolean;
  onApply: (body: Record<string, unknown>) => void;
}

export function RosterPresets({ choices, target, busy, onApply }: Props): JSX.Element {
  const [who, setWho] = useState(TARGET);
  const [preset, setPreset] = useState('');
  const [typed, setTyped] = useState('');

  if (choices === null) return <p class="dev-hint">Loading the players...</p>;
  const presetId = choices.presets.some((p) => p.id === preset)
    ? preset
    : (choices.presets[0]?.id ?? '');
  const targetPlayer = choices.players.find((p) => p.userId === target);
  const resolved = who === EVERYONE ? EVERYONE : (targetPlayer?.userId ?? null);
  const word = resolved === null ? null : confirmWord(choices, resolved);
  const picked = choices.presets.find((p) => p.id === presetId);
  const ready = presetId !== '' && resolved !== null && typedMatches(typed, word);

  return (
    <form
      class="dev-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && resolved !== null) onApply(presetBody(resolved, presetId, typed));
      }}
    >
      <p class="dev-form-title">Give a roster preset</p>
      <div class="dev-fields">
        <label class="dev-field">
          <span>Preset</span>
          <select
            value={presetId}
            onChange={(e) => {
              setPreset(e.currentTarget.value);
            }}
          >
            {choices.presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label class="dev-field">
          <span>Give it to</span>
          <select
            value={who}
            onChange={(e) => {
              setWho(e.currentTarget.value);
              setTyped('');
            }}
          >
            <option value={TARGET}>{targetPlayer?.name ?? 'The target player'}</option>
            <option value={EVERYONE}>Everyone ({String(choices.players.length)})</option>
          </select>
        </label>
        <label class="dev-field">
          <span>Type {word ?? '...'} to confirm</span>
          <input
            type="text"
            autocomplete="off"
            value={typed}
            onInput={(e) => {
              setTyped(e.currentTarget.value);
            }}
          />
        </label>
      </div>
      <button type="submit" class="dev-btn dev-danger" disabled={busy || !ready}>
        Replace creatures and bag
      </button>
      {picked !== undefined && <p class="dev-hint">{presetLine(picked)}.</p>}
      <p class="dev-hint">
        Replaces the creatures and the gear bag of{' '}
        {who === EVERYONE ? 'every player of this server' : 'that player'} (their raid placements go
        with them; Bait, Essence and the rest stay). Simulated players are left alone.
      </p>
    </form>
  );
}
