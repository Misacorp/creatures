import { Component, type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { PopoverHost } from '../PopoverHost';
import { buildFeedback, clipboardText, issueUrl } from './feedback';
import {
  BACKGROUNDS,
  BACKGROUND_LABELS,
  WIDTHS,
  formatHash,
  parseHash,
  viewProps,
  type Background,
  type View,
  type Width,
} from './hash';
import { PropControls } from './PropControls';
import { presetProps } from './props';
import { ENTRIES, entriesByGroup, findEntry } from './registry';
import type { Entry, Props, Value } from './types';

/** Draws a page's component; if it throws with some props, says so instead of blanking the workbench. */
class Preview extends Component<{ children: ComponentChildren }, { error: string | null }> {
  override state = { error: null as string | null };

  static override getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  override render() {
    if (this.state.error !== null) {
      return (
        <p class="error" role="alert">
          This component could not be drawn with these props: {this.state.error}
        </p>
      );
    }
    return this.props.children;
  }
}

/** The shareable address of a view, always on this page of this site. */
function shareLink(hash: string): string {
  return `${window.location.origin}/workbench.html${hash}`;
}

function Index({
  filter,
  onFilter,
  current,
  hashFor,
}: {
  filter: string;
  onFilter: (text: string) => void;
  current: Entry | null;
  hashFor: (entry: Entry) => string;
}) {
  const needle = filter.trim().toLowerCase();
  const shown = ENTRIES.filter(
    (e) =>
      needle === '' ||
      e.name.toLowerCase().includes(needle) ||
      e.description.toLowerCase().includes(needle),
  );
  const groups = entriesByGroup(shown);
  return (
    <nav class="wb-list" aria-label="Components">
      <label for="wb-filter">Find a component</label>
      <input
        id="wb-filter"
        type="text"
        value={filter}
        placeholder="Name or word"
        maxLength={40}
        onInput={(event) => {
          onFilter(event.currentTarget.value);
        }}
      />
      {groups.length === 0 && <p class="muted">Nothing matches.</p>}
      {groups.map(({ group, entries }) => (
        <section key={group}>
          <h2>{group}</h2>
          <ul>
            {entries.map((e) => (
              <li key={e.name}>
                <a
                  href={hashFor(e)}
                  class={current?.name === e.name ? 'wb-item current' : 'wb-item'}
                  aria-current={current?.name === e.name ? 'page' : undefined}
                >
                  <code>{e.name}</code>
                  <span class="wb-item-text">{e.description}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function Switcher<T extends string>({
  label,
  options,
  value,
  names,
  onPick,
}: {
  label: string;
  options: readonly T[];
  value: T;
  names?: Readonly<Record<T, string>>;
  onPick: (value: T) => void;
}) {
  return (
    <div class="wb-switch" role="group" aria-label={label}>
      <span class="wb-switch-label">{label}</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          class={option === value ? 'toggle on' : 'toggle'}
          aria-pressed={option === value}
          onClick={() => {
            onPick(option);
          }}
        >
          {names?.[option] ?? option}
        </button>
      ))}
    </div>
  );
}

function Feedback({ entry, props, view }: { entry: Entry; props: Props; view: View }) {
  const [status, setStatus] = useState('');
  const hash = formatHash(entry, props, view.width, view.background);
  const feedback = buildFeedback({
    entry,
    props,
    width: view.width === 'full' ? 'full window' : view.width,
    link: shareLink(hash),
  });
  const text = clipboardText(feedback);
  const copy = (): void => {
    navigator.clipboard.writeText(text).then(
      () => {
        setStatus('Copied. Paste it into a chat.');
      },
      () => {
        setStatus('Could not copy here. Select the text below and copy it by hand.');
      },
    );
  };
  return (
    <section class="wb-feedback" aria-labelledby="wb-feedback-title">
      <h3 id="wb-feedback-title">Feedback</h3>
      <p class="muted small">
        Opens a prefilled GitHub issue (you need to be signed in to GitHub). Add what you would like
        changed on the last line.
      </p>
      <p class="button-row">
        <a
          class="wb-button primary"
          href={issueUrl(feedback)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Give feedback
        </a>
        <button type="button" onClick={copy}>
          Copy details
        </button>
      </p>
      <p class="muted small" role="status">
        {status}
      </p>
      <details>
        <summary>What will be sent</summary>
        <pre class="wb-pre">{text}</pre>
      </details>
    </section>
  );
}

/**
 * The preview is a second copy of this page, in an iframe of the chosen width, that draws only the
 * component (`?frame=1`). So the game's media queries see a real phone-sized window, exactly as in
 * the game. The frame reads its props from its own address, which this keeps in step (a change of
 * address inside the same page does not reload it, so a demo keeps its state while props change).
 */
function PreviewFrame({ hash, width }: { hash: string; width: Width }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const first = useRef(true);
  const base = `${window.location.pathname}?frame=1`;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.contentWindow?.location.replace(`${base}${hash}`);
  }, [hash]);
  return (
    <iframe ref={ref} class={`wb-iframe wb-w-${width}`} title="Preview" src={`${base}${hash}`} />
  );
}

/** Inside the preview iframe: just the component on its background, sized to its content. */
function FrameView() {
  const [view, setView] = useState<View>(() => parseHash(window.location.hash));
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onHash = (): void => {
      setView(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, []);
  // Tell the page around us how tall we are (same site, so it can be read and set directly).
  useEffect(() => {
    const el = wrap.current;
    // The frame element belongs to the page around us (another realm), so `instanceof` would fail.
    const frame = window.frameElement as HTMLElement | null;
    if (el === null || frame === null || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(() => {
      frame.style.setProperty('height', `${String(el.offsetHeight)}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  const entry = findEntry(view.component);
  // `?bare=1`: the entry straight in the page, no stage, so it sees the window as the game does.
  if (new URLSearchParams(window.location.search).has('bare')) {
    return (
      <PopoverHost onOpenHowTo={() => undefined}>
        {entry === null ? (
          <p class="muted">No such component.</p>
        ) : (
          <Preview>{entry.render(viewProps(entry, view))}</Preview>
        )}
      </PopoverHost>
    );
  }
  return (
    <PopoverHost onOpenHowTo={() => undefined}>
      <div class="wb-frame-wrap" ref={wrap}>
        {entry === null ? (
          <p class="muted">No such component.</p>
        ) : (
          <div class={`wb-frame-stage wb-bg-${view.background}`}>
            <Preview>{entry.render(viewProps(entry, view))}</Preview>
          </div>
        )}
      </div>
    </PopoverHost>
  );
}

function Page({
  entry,
  view,
  nonce,
  onProps,
  onFrame,
  onReset,
}: {
  entry: Entry;
  view: View;
  nonce: number;
  onProps: (props: Props) => void;
  onFrame: (width: Width, background: Background) => void;
  onReset: () => void;
}) {
  const props = viewProps(entry, view);
  const change = (name: string, value: Value): void => {
    onProps({ ...props, [name]: value });
  };
  return (
    <article class="wb-page" aria-labelledby="wb-name">
      <p>
        <a href="#" class="wb-back">
          All components
        </a>
      </p>
      <h2 id="wb-name" class="wb-name">
        <code>{entry.name}</code>
      </h2>
      <p class="wb-file">
        <code>{entry.file}</code>
      </p>
      <p>{entry.description}</p>
      <div class="wb-columns">
        <div class="wb-preview-col">
          <div class="wb-frame-controls">
            <Switcher
              label="Width"
              options={WIDTHS}
              value={view.width}
              onPick={(width) => {
                onFrame(width, view.background);
              }}
            />
            <Switcher
              label="Background"
              options={BACKGROUNDS}
              value={view.background}
              names={BACKGROUND_LABELS}
              onPick={(background) => {
                onFrame(view.width, background);
              }}
            />
          </div>
          <div class="wb-viewport">
            <PreviewFrame
              key={`${entry.name}-${String(nonce)}`}
              hash={formatHash(entry, props, view.width, view.background)}
              width={view.width}
            />
          </div>
        </div>
        <div class="wb-side">
          {entry.presets.length > 0 && (
            <section aria-labelledby="wb-presets-title">
              <h3 id="wb-presets-title">Presets</h3>
              <p class="wb-presets">
                {entry.presets.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      onProps(presetProps(entry, preset));
                    }}
                  >
                    {preset.name}
                  </button>
                ))}
              </p>
            </section>
          )}
          <section aria-labelledby="wb-props-title">
            <h3 id="wb-props-title">Props</h3>
            <PropControls entry={entry} props={props} onChange={change} />
            <p class="button-row">
              <button
                type="button"
                onClick={() => {
                  onProps(presetProps(entry, { props: {} }));
                }}
              >
                Reset props
              </button>
              <button type="button" onClick={onReset}>
                Restart preview
              </button>
            </p>
          </section>
          <Feedback entry={entry} props={props} view={view} />
        </div>
      </div>
    </article>
  );
}

/** The workbench: a list of components, and a page for the one picked (kept in the address). */
export function Workbench() {
  if (new URLSearchParams(window.location.search).has('frame')) return <FrameView />;
  return <WorkbenchPage />;
}

function WorkbenchPage() {
  const [view, setView] = useState<View>(() => parseHash(window.location.hash));
  const [filter, setFilter] = useState('');
  const [nonce, setNonce] = useState(0);
  const [note, setNote] = useState('');

  useEffect(() => {
    const onHash = (): void => {
      setView(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  const entry = findEntry(view.component);

  /** Writes the view into the address without adding a history step (props change a lot). */
  const write = (next: Entry | null, props: Props, width: Width, background: Background): void => {
    const hash = formatHash(next, props, width, background);
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${hash}`,
    );
    setView(parseHash(hash));
  };

  const hashFor = (e: Entry): string => formatHash(e, e.defaults, view.width, view.background);

  return (
    <PopoverHost
      onOpenHowTo={() => {
        setNote('The How to play page is not part of the workbench.');
      }}
    >
      <main class="wb" data-page={entry === null ? 'index' : 'component'}>
        <header class="wb-head">
          <h1>Component workbench</h1>
          <p class="muted small">
            Staging only. Every reusable piece of the game with sample data: pick one, change its
            props, and send feedback. {ENTRIES.length} components.
          </p>
          {note !== '' && (
            <p class="small" role="status">
              {note}
            </p>
          )}
        </header>
        <div class="wb-layout">
          <Index filter={filter} onFilter={setFilter} current={entry} hashFor={hashFor} />
          {entry === null ? (
            <p class="wb-empty muted">Pick a component from the list.</p>
          ) : (
            <Page
              entry={entry}
              view={view}
              nonce={nonce}
              onProps={(props) => {
                write(entry, props, view.width, view.background);
              }}
              onFrame={(width, background) => {
                write(entry, viewProps(entry, view), width, background);
              }}
              onReset={() => {
                setNonce((n) => n + 1);
              }}
            />
          )}
        </div>
      </main>
    </PopoverHost>
  );
}
