/**
 * The one place where package C2's panels meet the host page. `HousePlace` and `VisitHouse` import every panel from here, and
 * only from here, with the props of `docs/design/housing.md` 4.5 (written out below as the contract). Until C2 merges each panel is
 * a small stand-in saying so; to wire C2, replace each stand-in with `export { Name } from './Name';` (the real component takes
 * these very props) and delete the stand-in and its props interface here. Nothing else changes.
 */
import type {
  CatalogueView,
  GuestbookEntry,
  HouseListView,
  HousePay,
  HouseView,
  HousemateView,
  OwnHouseView,
  RoomView,
  VisitToday,
} from '@creatures/game';
import type { Creature } from '../api';
import { Alert } from '../ui/Alert';

function Pending({ name, props }: { name: string; props: object }) {
  return (
    <Alert level="info">
      <span data-panel-pending={name} data-props={Object.keys(props).join(' ')}>
        {name} is not here yet.
      </span>
    </Alert>
  );
}

export interface BuildPanelProps {
  house: HouseView;
  own: OwnHouseView;
  busy: boolean;
  error: string | null;
  onPay: (partId: string, pay: HousePay) => void;
}
export function BuildPanel(props: BuildPanelProps) {
  return <Pending name="Build" props={props} />;
}

export interface WorkbenchPanelProps {
  own: OwnHouseView;
  busy: boolean;
  error: string | null;
  focus?: string;
  onCraft: (itemId: string) => void;
}
export function WorkbenchPanel(props: WorkbenchPanelProps) {
  return <Pending name="Workbench" props={props} />;
}

export interface CataloguePanelProps {
  catalogue: CatalogueView | null;
  failed: boolean;
  onRetry: () => void;
}
export function CataloguePanel(props: CataloguePanelProps) {
  return <Pending name="Catalogue" props={props} />;
}

export interface SpotPickerProps {
  room: RoomView;
  spotId: string;
  own: OwnHouseView;
  housemates: HousemateView[];
  creatures: readonly Creature[];
  busy: boolean;
  onPlace: (pieceId: string | null) => void;
  onHousemate: (creatureId: string | null) => void;
  onMake: (itemId: string) => void;
}
export function SpotPicker(props: SpotPickerProps) {
  return <Pending name="Spot picker" props={props} />;
}

export interface SkinPickerProps {
  kind: 'wall' | 'floor' | 'roof' | 'walls';
  current: string;
  own: OwnHouseView;
  busy: boolean;
  onPick: (skinId: string) => void;
  onMake: (itemId: string) => void;
}
export function SkinPicker(props: SkinPickerProps) {
  return <Pending name="Skin picker" props={props} />;
}

export interface MailboxPanelProps {
  mailbox: OwnHouseView['mailbox'];
  busy: boolean;
  onCollect: () => void;
}
export function MailboxPanel(props: MailboxPanelProps) {
  return <Pending name="Mailbox" props={props} />;
}

export interface VisitListProps {
  list: HouseListView | null;
  failed: boolean;
  onRetry: () => void;
  onOpen: (userId: string) => void;
}
export function VisitList(props: VisitListProps) {
  return <Pending name="Visit list" props={props} />;
}

export interface GuestbookProps {
  entries: readonly GuestbookEntry[];
  now: number;
}
export function Guestbook(props: GuestbookProps) {
  return <Pending name="Guestbook" props={props} />;
}

export interface StampPickerProps {
  owned: readonly string[];
  used: boolean;
  busy: boolean;
  onStamp: (stampId: string) => void;
}
export function StampPicker(props: StampPickerProps) {
  return <Pending name="Stamp picker" props={props} />;
}

export interface GiftButtonProps {
  today: VisitToday;
  giftLeft: boolean;
  busy: boolean;
  onGift: () => void;
}
export function GiftButton(props: GiftButtonProps) {
  return <Pending name="Gift" props={props} />;
}
