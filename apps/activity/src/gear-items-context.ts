import { createContext } from 'preact';
import type { GearItem } from './gear-types';

/**
 * The inventory's items from the gear view (`Game` provides them once loaded; empty before). A `FindItem`
 * with an `id` looks its item up here to show the full card, whose stats and lines are the server's.
 */
export const GearItemsContext = createContext<readonly GearItem[]>([]);
