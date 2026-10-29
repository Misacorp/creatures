/**
 * Direction 1, "the valley is the menu". PLACEHOLDER: the valley prototype replaces this folder's contents
 * and keeps the `registerProto` call.
 */
import { registerProto } from '../registry';
import { TOUR_STEPS } from '../tour';

registerProto({
  id: 'valley',
  title: 'Valley (placeholder)',
  steps: TOUR_STEPS.map(({ id, title }) => ({ id, title })),
  render: ({ step }) => (
    <main style="padding:2rem">
      <h1>Valley (placeholder)</h1>
      <p>Step {String(step)}</p>
    </main>
  ),
});
