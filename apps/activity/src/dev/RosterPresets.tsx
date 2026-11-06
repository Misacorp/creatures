/**
 * The roster preset picker of the "Playtest" section: a player of this server (or everyone), a preset, and a
 * confirmation typed in (the player's name, or "everyone") before Apply works. It replaces that player's creatures and
 * gear bag with the preset, on the server (`apply-roster-preset`, `apps/worker/src/dev-presets.ts`). The controls are
 * the panel's own (`dev-form`, `dev-field`, `dev-btn`); the list comes from `GET /api/dev/players`.
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { fetchPresetChoices, presetLine, type PresetChoices } from './dev-api';

/** The picker's value for "everyone". */
const EVERYONE = 'everyone';

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
  busy: boolean;
  /** Bumps after a tool ran, so the counts shown next to the names are read again. */
  version: number;
  onApply: (body: Record<string, unknown>) => void;
}

export function RosterPresets({ busy, version, onApply }: Props): JSX.Element {
  const [choices, setChoices] = useState<PresetChoices | null>(null);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState(EVERYONE);
  const [preset, setPreset] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    void fetchPresetChoices().then((found) => {
      setFailed(found === null);
      if (found !== null) setChoices(found);
    });
  }, [version]);

  if (choices === null) {
    return (
      <p class="dev-hint">{failed ? 'Could not load the players.' : 'Loading the players...'}</p>
    );
  }
  const presetId = choices.presets.some((p) => p.id === preset)
    ? preset
    : (choices.presets[0]?.id ?? '');
  const targetId =
    target === EVERYONE || choices.players.some((p) => p.userId === target) ? target : EVERYONE;
  const word = confirmWord(choices, targetId);
  const picked = choices.presets.find((p) => p.id === presetId);
  const ready = presetId !== '' && typedMatches(typed, word);

  return (
    <form
      class="dev-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onApply(presetBody(targetId, presetId, typed));
      }}
    >
      <p class="dev-form-title">Give a roster preset</p>
      <div class="dev-fields">
        <label class="dev-field">
          <span>Player</span>
          <select
            value={targetId}
            onChange={(e) => {
              setTarget(e.currentTarget.value);
              setTyped('');
            }}
          >
            <option value={EVERYONE}>Everyone ({String(choices.players.length)})</option>
            {choices.players.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name} ({String(p.creatures)} creatures, {String(p.items)} items)
              </option>
            ))}
          </select>
        </label>
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
        {targetId === EVERYONE ? 'every player of this server' : 'that player'} (their raid
        placements go with them; Bait, Essence and the rest stay). Simulated players are left alone.
      </p>
    </form>
  );
}
