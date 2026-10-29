import { render } from 'preact';
import '../styles/index.css';
import './proto.css';
import { Proto } from './Proto';
// Each prototype registers itself when its module loads (`registerProto`); replace only your own folder.
import './valley';
import './party';

/** A string only the prototype page contains: the production build test searches the output for it. */
const PROTOTYPE_MARKER = 'PROTOTYPE_MARKER_3e8a';

const root = document.getElementById('prototype');
if (root === null) {
  throw new Error('Missing #prototype element');
}
root.dataset['prototype'] = PROTOTYPE_MARKER;
render(<Proto />, root);
