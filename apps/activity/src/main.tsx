import { render } from 'preact';
import { App } from './App';
import './styles/index.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app element');
}
render(<App />, root);

// Looks are staging-only until one is picked: in a production build this is dead code and no look CSS ships.
if (__DEV_TOOLS_BUILD__) void import('./dev/looks-boot');
