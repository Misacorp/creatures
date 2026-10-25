import type { ComponentChildren, RefObject } from 'preact';
import type { BoardSettings, IdleMode, TiltMode } from '../home/board';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { Segmented } from '../ui/Segmented';

const TILT_OPTIONS: readonly { id: TiltMode; label: string }[] = [
  { id: 'none', label: 'Flat' },
  { id: 'still', label: 'Leaning' },
];

const IDLE_OPTIONS: readonly { id: IdleMode; label: string }[] = [
  { id: 'hide', label: 'Hide' },
  { id: 'show', label: 'Show' },
];

/** One setting: its name and a line about it, then its control (a row per setting). */
function SettingRow({
  name,
  hint,
  children,
}: {
  name: string;
  hint: string;
  children: ComponentChildren;
}) {
  return (
    <li class="setting-row">
      <div class="setting-text">
        <b class="setting-name">{name}</b>
        <span class="setting-hint">{hint}</span>
      </div>
      {children}
    </li>
  );
}

/**
 * The Settings page, opened from the cog in the HUD: a drill-in ("‹ Back", Escape) of sections, one row per
 * setting, each a name, a line about it and a control. How to play opens from here too (the HUD keeps one
 * button so the place's name fits a phone). The choices are display preferences kept on this device
 * (`home/board-settings.ts`), never the server's. A new setting is one `SettingRow` in a section; a new
 * section is one more `<section class="settings-section">`.
 */
export function SettingsPage({
  settings,
  onChange,
  onBack,
  backLabel = 'to the game',
  onHowTo,
  howToRef,
}: {
  settings: BoardSettings;
  onChange: (next: BoardSettings) => void;
  onBack: () => void;
  backLabel?: string;
  /** Opens How to play; without it the Help section is not drawn. */
  onHowTo?: () => void;
  /** Where the focus returns when How to play closes. */
  howToRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <section class="home-sub settings-page" aria-label="Settings" onKeyDown={onDrillKey(onBack)}>
      <DrillHead title="Settings" backLabel={backLabel} onBack={onBack} scroll focus />
      {onHowTo !== undefined && (
        <section class="settings-section" aria-labelledby="settings-help">
          <h4 id="settings-help" class="stat-group-title pix">
            Help
          </h4>
          <ul class="settings-list">
            <SettingRow
              name="How to play"
              hint="The rules of the valley, a page per part of the game."
            >
              <button
                type="button"
                {...(howToRef === undefined ? {} : { ref: howToRef })}
                class="settings-howto"
                aria-label="Open How to play"
                aria-haspopup="dialog"
                onClick={onHowTo}
              >
                Open
              </button>
            </SettingRow>
          </ul>
        </section>
      )}
      <section class="settings-section" aria-labelledby="settings-board">
        <h4 id="settings-board" class="stat-group-title pix">
          The notice board
        </h4>
        <ul class="settings-list">
          <SettingRow name="Notices" hint="How the papers hang on the board.">
            <Segmented
              label="Notices"
              options={TILT_OPTIONS}
              value={settings.tilt}
              onChange={(tilt) => {
                onChange({ ...settings, tilt });
              }}
            />
          </SettingRow>
          <SettingRow name="Quiet places" hint="A slim note for places where nothing is going on.">
            <Segmented
              label="Quiet places"
              options={IDLE_OPTIONS}
              value={settings.idle}
              onChange={(idle) => {
                onChange({ ...settings, idle });
              }}
            />
          </SettingRow>
        </ul>
      </section>
    </section>
  );
}
