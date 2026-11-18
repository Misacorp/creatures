import { render } from 'preact';
import '../styles/index.css';
import './workbench.css';
import { applyTwilightLook, twilightLookOf } from '../housing/house-light-looks';
import { parseHash } from './hash';
import { Workbench } from './Workbench';

/** Dev switch for the twilight options (`housing/house-light-looks.ts`): `twilightLook` in the address's props, before any paint. */
const look = twilightLookOf(parseHash(window.location.hash).props['twilightLook']);
if (look !== null) applyTwilightLook(look);

/** A string only the workbench contains: the production build test searches the output for it. */
const WORKBENCH_MARKER = 'WORKBENCH_MARKER_5c1e';

const root = document.getElementById('workbench');
if (root === null) {
  throw new Error('Missing #workbench element');
}
root.dataset['workbench'] = WORKBENCH_MARKER;
render(<Workbench />, root);
