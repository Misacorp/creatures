/**
 * The one place where the panels meet the host page. `HousePlace` and `VisitHouse` import every panel from here, and only from
 * here, with the props of `docs/design/housing.md` 4.5 (each component's own props interface is the contract).
 */
export { BuildPanel } from './BuildPanel';
export { WorkbenchPanel } from './WorkbenchPanel';
export { CataloguePanel } from './CataloguePanel';
export { SpotPicker } from './SpotPicker';
export { SkinPicker } from './SkinPicker';
export { MailboxPanel } from './MailboxPanel';
export { VisitList } from './VisitList';
export { Guestbook } from './Guestbook';
export { StampPicker, ownedStamps } from './StampPicker';
export { GiftButton, giftReason } from './GiftButton';
