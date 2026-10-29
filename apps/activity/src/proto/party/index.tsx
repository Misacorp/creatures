/**
 * Direction 2, "your creatures run the show". PLACEHOLDER: the party prototype replaces this folder's
 * contents and keeps the `registerProto` call.
 */
import { registerProto } from '../registry';
import { TOUR_STEPS } from '../tour';

registerProto({
  id: 'party',
  title: 'Party (placeholder)',
  steps: TOUR_STEPS.map(({ id, title }) => ({ id, title })),
  render: ({ step }) => (
    <main style="padding:2rem">
      <h1>Party (placeholder)</h1>
      <p>Step {String(step)}</p>
    </main>
  ),
});
