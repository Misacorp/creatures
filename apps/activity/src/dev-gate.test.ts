import { describe, expect, it, vi } from 'vitest';
import { loadDevPanel, type DevPanelLoader } from './dev-gate';

const fakeModule = { default: () => null };

describe('the debug panel gate', () => {
  it('does not load the panel when the server did not turn the dev tools on', () => {
    const load = vi.fn<DevPanelLoader>(() => Promise.resolve(fakeModule));
    expect(loadDevPanel(false, load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('loads the panel when the server says devTools is on (in a build that has it)', async () => {
    // The test build always has the panel (`__DEV_TOOLS_BUILD__` is true for the `serve` command).
    expect(__DEV_TOOLS_BUILD__).toBe(true);
    const load = vi.fn<DevPanelLoader>(() => Promise.resolve(fakeModule));
    const loading = loadDevPanel(true, load);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(loading).resolves.toBe(fakeModule);
  });
});
