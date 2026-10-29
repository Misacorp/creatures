/**
 * The stylesheets of the looks (`src/looks.ts`). Dev tools only: a production build never imports this
 * file (`main.tsx` imports it behind `__DEV_TOOLS_BUILD__`), so no look ships until Misa picks one.
 * Import it AFTER `styles/index.css`: the looks override the base styles, so they must come later in the cascade.
 */
import './styles/looks/arcade.css';
import './styles/looks/hearth.css';
import './styles/looks/quest.css';
