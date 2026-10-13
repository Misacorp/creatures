import { render } from 'preact';
import { App } from './App';
import './styles/index.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app element');
}
render(<App />, root);
