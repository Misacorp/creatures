/**
 * Someone else's house, read-only (`docs/design/housing.md` 4.5): the same scene, rooms that open read-only (their pieces and
 * displays are tappable pictures with a popover), the guestbook, and the visitor's two actions, a gift and a stamp, pinned at the
 * bottom. The owner may be offline; nothing here changes their house. On a wide window the scene stays in the main area and the
 * guestbook and the actions sit in the side panel. Back leaves a room first, then the house.
 */
import { useRef, useState } from 'preact/hooks';
import { housing, type GuestbookEntry, type HouseView, type VisitToday } from '@creatures/game';
import { errorText } from '../game';
import { useLoaded } from '../use-loaded';
import { useActionRunner } from '../use-action-runner';
import { Alert } from '../ui/Alert';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { SidePanel } from '../ui/SidePanel';
import { useWide } from '../ui/wide-layout';
import { WideLayout } from '../ui/WideLayout';
import { fetchHouse, giftHouse, HOUSE_ERRORS, stampHouse } from './housing-api';
import { HouseActionIds } from './use-house';
import { GiftButton, Guestbook, StampPicker } from './house-panels';
import { HouseScene, type ScrollMemory } from './HouseScene';
import { RoomFocus } from './RoomFocus';

export interface VisitHouseProps {
  /** The owner's Discord id (the house is read from it). */
  userId: string;
  /** The owner's name, for the title before the house has loaded. */
  name: string;
  /** What the caller did here today (from the visit list); the answers of a gift and a stamp update it. */
  today: VisitToday;
  /** The caller has a gift left to give today (the list's `me.giftLeft`). */
  giftLeft: boolean;
  /** The stamps the caller holds (their own house's items). */
  ownedStamps: readonly string[];
  /** The server's clock, for "5 minutes ago". */
  now: number;
  /** Back to the list. */
  onBack: () => void;
  /** The caller gifted or stamped: the list's marks and the gift left update. */
  onToday?: (today: VisitToday, giftUsed: boolean) => void;
  /** A house already in hand (the workbench's samples and tests): nothing is requested. */
  house?: HouseView;
}

/** A visited house: see the file comment. */
export function VisitHouse({
  userId,
  name,
  today: initialToday,
  giftLeft,
  ownedStamps,
  now,
  onBack,
  onToday,
  house: given,
}: VisitHouseProps) {
  const loaded = useLoaded(
    () => (given === undefined ? fetchHouse(userId).then((a) => a.house) : Promise.resolve(given)),
    [userId],
  );
  const [room, setRoom] = useState<string | null>(null);
  const [today, setToday] = useState<VisitToday>(initialToday);
  const [gifted, setGifted] = useState(false);
  const [guestbook, setGuestbook] = useState<readonly GuestbookEntry[] | null>(null);
  const wide = useWide();
  const memory = useRef<ScrollMemory['current']>(null) as ScrollMemory;
  const { busy, error, setError, runKeyed } = useActionRunner({
    errorText: (err) => errorText(err, undefined, HOUSE_ERRORS),
  });
  const house = loaded.value;
  const back = (): void => {
    if (room === null) onBack();
    else setRoom(null);
  };
  const roomKind = room === null ? undefined : house?.rooms.find((r) => r.id === room)?.kind;
  const roomName =
    roomKind === undefined ? null : (housing.rooms.find((k) => k.id === roomKind)?.name ?? null);
  const title = `${house?.owner.name ?? name}'s house`;

  const gift = async (): Promise<void> => {
    const answer = await runKeyed(HouseActionIds.gift(userId), (key) => giftHouse(userId, key));
    if (answer === undefined) return;
    setToday(answer.today);
    setGifted(true);
    onToday?.(answer.today, true);
  };
  const stamp = async (stampId: string): Promise<void> => {
    const answer = await runKeyed(`house-stamp:${userId}:${stampId}`, () =>
      stampHouse(userId, stampId),
    );
    if (answer === undefined) return;
    setToday(answer.today);
    setGuestbook(answer.guestbook);
    onToday?.(answer.today, false);
  };

  const actions = (
    <div class="house-visit-act">
      <GiftButton
        today={today}
        giftLeft={giftLeft && !gifted}
        busy={busy}
        onGift={() => {
          void gift();
        }}
      />
      <StampPicker
        owned={ownedStamps}
        used={today.stamped}
        busy={busy}
        onStamp={(id) => {
          void stamp(id);
        }}
      />
    </div>
  );
  const book = <Guestbook entries={guestbook ?? house?.guestbook ?? []} now={now} />;
  const alerts = error !== null && (
    <Alert
      level="alert"
      onDismiss={() => {
        setError(null);
      }}
    >
      {error}
    </Alert>
  );
  const main =
    house === null ? (
      loaded.failed ? (
        <Alert level="alert">
          Could not open that house.{' '}
          <button type="button" onClick={loaded.reload}>
            Try again
          </button>
        </Alert>
      ) : (
        <p class="muted">Walking over...</p>
      )
    ) : room === null ? (
      <HouseScene house={house} mode="visit" onRoom={setRoom} memory={memory} />
    ) : (
      <RoomFocus house={house} roomId={room} mode="visit" />
    );
  return (
    <section class="house-visit" aria-label={title} onKeyDown={onDrillKey(back)}>
      <DrillHead
        title={roomName === null ? title : `${title}: ${roomName}`}
        backLabel={room === null ? 'to the houses' : 'to the house'}
        onBack={back}
        scroll
        focus
      />
      {alerts}
      <WideLayout
        wide={wide}
        main={main}
        panel={
          house === null ? null : (
            <SidePanel title="Guestbook" titleId="house-visit-book" footer={actions}>
              {book}
            </SidePanel>
          )
        }
      >
        {!wide && house !== null && (
          <>
            {book}
            {actions}
          </>
        )}
      </WideLayout>
    </section>
  );
}
