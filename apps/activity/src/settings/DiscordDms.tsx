import { useRef, useState } from 'preact/hooks';
import {
  DM_KINDS,
  type DmKind,
  type Notifications,
  type NotificationsApi,
} from '../notifications-api';
import { Alert } from '../ui/Alert';
import { Segmented } from '../ui/Segmented';
import { useLoaded } from '../use-loaded';
import { SettingRow } from './SettingRow';

const ON_OFF: readonly { id: 'off' | 'on'; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'on', label: 'On' },
];

const KIND_TEXT: Readonly<Record<DmKind, { name: string; hint: string }>> = {
  trip: { name: 'Trips home', hint: 'A DM when a creature comes home from an expedition.' },
  job: { name: 'Workshop jobs', hint: 'A DM when a job at the Workshop is done.' },
  finale: {
    name: 'Raid finale',
    hint: "A DM 10 minutes before Sunday's raid finale starts.",
  },
  stall: { name: 'Prize Stall', hint: 'A DM when the Prize Stall opens on Wednesday.' },
};

/**
 * The "Discord DMs" section of the Settings page. Unlike the board settings these are the server's: they
 * load when the page opens and are saved on each change (shown at once, put back if the save fails). Drawn
 * only once loaded and only where the server can send DMs. When Discord refused the bot's DM it says how to
 * allow it; changing any setting makes the server try again.
 */
export function DiscordDms({ api }: { api: NotificationsApi }) {
  const loaded = useLoaded(api.load, []);
  const [shown, setShown] = useState<Notifications | null>(null);
  const [failed, setFailed] = useState(false);
  // Only the newest save may put its answer on screen.
  const latest = useRef(0);
  const view = shown ?? loaded.value;

  if (loaded.failed && view === null) {
    return (
      <section class="settings-section" aria-labelledby="settings-dms">
        <h4 id="settings-dms" class="stat-group-title pix">
          Discord DMs
        </h4>
        <Alert level="alert">
          Could not load these.{' '}
          <button type="button" onClick={loaded.reload}>
            Try again
          </button>
        </Alert>
      </section>
    );
  }
  if (view === null || !view.available) return null;

  const change = (kind: DmKind, on: boolean): void => {
    const before = view;
    const request = ++latest.current;
    setFailed(false);
    setShown({ ...view, kinds: { ...view.kinds, [kind]: on } });
    api.save({ [kind]: on }).then(
      (next) => {
        if (request === latest.current) setShown(next);
      },
      () => {
        if (request !== latest.current) return;
        setShown(before);
        setFailed(true);
      },
    );
  };

  return (
    <section class="settings-section" aria-labelledby="settings-dms">
      <h4 id="settings-dms" class="stat-group-title pix">
        Discord DMs
      </h4>
      {view.blocked && (
        <Alert level="warning" title="Cannot reach you" layout="stacked">
          The bot could not send you a DM. In Discord, open this server&apos;s Privacy Settings and
          allow direct messages from server members, then flip a setting here to try again.
        </Alert>
      )}
      {failed && <Alert level="alert">Could not save that. Try again.</Alert>}
      <ul class="settings-list">
        {DM_KINDS.map((kind) => (
          <SettingRow key={kind} name={KIND_TEXT[kind].name} hint={KIND_TEXT[kind].hint}>
            <Segmented
              label={KIND_TEXT[kind].name}
              options={ON_OFF}
              value={view.kinds[kind] ? 'on' : 'off'}
              onChange={(id) => {
                change(kind, id === 'on');
              }}
            />
          </SettingRow>
        ))}
      </ul>
    </section>
  );
}
