import { render } from 'preact';
import '../styles/index.css';
import './combat-lab.css';
import { CombatLab } from './CombatLab';

/** A string only the combat lab contains: the production build test searches the output for it. */
const COMBAT_LAB_MARKER = 'COMBAT_LAB_MARKER_9d2b';

const root = document.getElementById('combat-lab');
if (root === null) {
  throw new Error('Missing #combat-lab element');
}
root.dataset['combatLab'] = COMBAT_LAB_MARKER;
render(<CombatLab />, root);
