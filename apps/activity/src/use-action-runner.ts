/**
 * Binds the action runner (`action-runner.ts`) to a component: the busy flag, the error line and
 * the notice line are its state, and the key store lives as long as the component. The screen
 * gives only what is its own: how to reload after a stale "no", and what else to do on a failure.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { createKeyStore, isStaleError, type KeyStore } from './actions';
import { createActionRunner, type ActionRunner, type ActionRunnerConfig } from './action-runner';
import { errorText } from './game';

/**
 * What a screen may give: `errorText` (the game's usual text when left out), `isStale` (any 404 or
 * 409 when left out) and the `onStart`, `onFail` and `onStale` hooks.
 */
type RunnerOptions = Partial<
  Pick<ActionRunnerConfig, 'errorText' | 'isStale' | 'onStart' | 'onFail' | 'onStale'>
>;

interface ActionRunnerView {
  busy: boolean;
  error: string | null;
  notice: string | null;
  setBusy: (busy: boolean) => void;
  setError: (text: string | null) => void;
  setNotice: (text: string | null) => void;
  inFlight: ActionRunner['inFlight'];
  run: ActionRunner['run'];
  runKeyed: ActionRunner['runKeyed'];
}

export function useActionRunner(options: RunnerOptions = {}): ActionRunnerView {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  const latest = useRef(options);
  latest.current = options;
  const keys = useRef<KeyStore | null>(null);
  keys.current ??= createKeyStore();
  const runner = useRef<ActionRunner | null>(null);
  runner.current ??= createActionRunner(() => ({
    errorText,
    isStale: isStaleError,
    ...latest.current,
    keys: keys.current as KeyStore,
    setBusy,
    setError,
    setNotice,
    isMounted: () => mounted.current,
  }));

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { inFlight, run, runKeyed } = runner.current;
  return { busy, error, notice, setBusy, setError, setNotice, inFlight, run, runKeyed };
}
