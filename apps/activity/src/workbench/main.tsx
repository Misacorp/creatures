import { render } from 'preact';
import '../styles/index.css';
import './workbench.css';
import './creature-v3/creature-v3.css';
import { Workbench } from './Workbench';

/** A string only the workbench contains: the production build test searches the output for it. */
const WORKBENCH_MARKER = 'WORKBENCH_MARKER_5c1e';

const root = document.getElementById('workbench');
if (root === null) {
  throw new Error('Missing #workbench element');
}
root.dataset['workbench'] = WORKBENCH_MARKER;
render(<Workbench />, root);
