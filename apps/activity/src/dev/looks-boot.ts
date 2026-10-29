/** Staging start-up for looks: loads their stylesheets (after the base ones) and applies the remembered choice. */
import '../looks-styles';
import { applyStoredLook } from './look-prefs';

applyStoredLook();
