/**
 * What a click on the dashed outline of the next anvil opens in the Forge's canvas (the right drawer, a page on a phone): a wizard of
 * one step, the price and the one button that buys (a keyed spend, `SpendConfirm`); the reason it cannot be pressed is said above it.
 */
import type { ValleyVisit } from '../api';
import { Alert } from '../ui/Alert';
import { useWizard } from '../ui/use-wizard';
import { WizardView } from '../ui/Wizard';
import type { ForgeActions } from './ForgeAnvils';
import { PanelBody } from './PlaceCanvas';
import { SpendConfirm } from './seat-parts';
import { anvilBuyReason, anvilPrice } from './forge-view';

export function ForgeBuyPanel({
  visit,
  acorns,
  busy,
  error,
  actions,
  onClose,
}: {
  visit: ValleyVisit;
  acorns: number;
  busy: boolean;
  error: string | null;
  actions: ForgeActions;
  /** Back from the step, and after the anvil is bought. */
  onClose: () => void;
}) {
  const wizard = useWizard<'buy'>(
    [{ id: 'buy', title: 'A new anvil', backLabel: 'to the forge' }],
    {
      onExit: onClose,
    },
  );
  return (
    <PanelBody>
      <WizardView wizard={wizard}>
        <SpendConfirm
          text="Another smith can make gear for you, one piece after another."
          label="Buy the anvil"
          price={anvilPrice(visit.anvilPrices.next)}
          reason={anvilBuyReason(visit, acorns)}
          busy={busy}
          onConfirm={() => {
            void actions.buyAnvil().then((ok) => {
              if (ok) onClose();
            });
          }}
        />
        {error !== null && <Alert level="alert">{error}</Alert>}
      </WizardView>
    </PanelBody>
  );
}
