import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAway, parseGameState, type AwaySummary } from '../api';
import stateOffer from '../fixtures/expedition-state-offer.json';
import { byClass, byName, createPage, find, visibleText, type Page } from '../test-dom';
import { AWAY_SAMPLE, homeInput } from '../workbench/home-sample';
import { awayBadges, awayRows, awayWaitingLine, hasAwayNotice } from './away-notice';
import { DEFAULT_BOARD_SETTINGS, buildBoard, noticeIds } from './board';
import { HomePage } from './HomePage';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

const summary = (over: Partial<AwaySummary> = {}): AwaySummary => ({ ...AWAY_SAMPLE, ...over });

describe('parsing the summary', () => {
  it('is null when the server sends nothing or null, and the summary when it sends one', () => {
    expect(parseGameState(stateOffer).awayRewards).toBeNull();
    expect(parseGameState({ ...stateOffer, awayRewards: null }).awayRewards).toBeNull();
    expect(parseGameState({ ...stateOffer, awayRewards: AWAY_SAMPLE }).awayRewards).toEqual(
      AWAY_SAMPLE,
    );
  });

  it('refuses a damaged summary', () => {
    expect(() => parseAway({})).toThrow();
    expect(() => parseAway({ ...AWAY_SAMPLE, until: 1.5 })).toThrow();
    expect(() => parseAway({ ...AWAY_SAMPLE, tripsWaiting: 'two' })).toThrow();
    expect(() => parseAway({ ...AWAY_SAMPLE, sources: [{ kind: 'leet' }] })).toThrow();
    expect(() =>
      parseAway({
        ...AWAY_SAMPLE,
        sources: [{ ...(AWAY_SAMPLE.sources[0] ?? {}), kind: 'mystery' }],
      }),
    ).toThrow();
  });
});

describe('the rows and badges', () => {
  it('has a badge for each kind a source paid, none for zero', () => {
    const [leet, raid, games] = AWAY_SAMPLE.sources;
    expect(awayBadges(leet as never).map((b) => b.key)).toEqual(['bait']);
    expect(awayBadges(raid as never).map((b) => b.key)).toEqual([
      'essence',
      'items',
      'creatures',
      'xp',
    ]);
    expect(awayBadges(games as never).map((b) => [b.key, b.amount])).toEqual([
      ['medals', 2],
      ['xp', 180],
    ]);
  });

  it('names the sources in the game’s words, never the leet', () => {
    expect(awayRows(AWAY_SAMPLE).map((r) => r.name)).toEqual([
      'Daily gifts',
      'Raid',
      'Valley Games',
    ]);
  });

  it('says what waits to be claimed, or nothing', () => {
    expect(awayWaitingLine(summary())).toBe('2 trips and 1 job are waiting for you');
    expect(awayWaitingLine(summary({ tripsWaiting: 1, jobsWaiting: 0 }))).toBe(
      '1 trip is waiting for you',
    );
    expect(awayWaitingLine(summary({ tripsWaiting: 0, jobsWaiting: 3 }))).toBe(
      '3 jobs are waiting for you',
    );
    expect(awayWaitingLine(summary({ tripsWaiting: 0, jobsWaiting: 0 }))).toBeNull();
  });

  it('has a notice only when a source paid something', () => {
    expect(hasAwayNotice(null)).toBe(false);
    expect(hasAwayNotice(undefined)).toBe(false);
    expect(hasAwayNotice(summary({ sources: [] }))).toBe(false);
    expect(hasAwayNotice(summary())).toBe(true);
  });
});

describe('the board', () => {
  it('puts the paper first among the notices, and has none without a summary', () => {
    const board = buildBoard(homeInput('away', true), DEFAULT_BOARD_SETTINGS);
    expect(board.away).toEqual(AWAY_SAMPLE);
    expect(noticeIds(board)[0]).toBe('away');
    const without = buildBoard(homeInput('busy', true), DEFAULT_BOARD_SETTINGS);
    expect(without.away).toBeNull();
    expect(noticeIds(without)).not.toContain('away');
  });
});

describe('the paper', () => {
  function draw(onDismissAway?: (until: number) => void, busy = false): Page {
    const drawn = createPage();
    page = drawn;
    drawn.draw(
      <HomePage
        input={homeInput('away', true)}
        settings={DEFAULT_BOARD_SETTINGS}
        onGo={() => undefined}
        awayBusy={busy}
        {...(onDismissAway === undefined ? {} : { onDismissAway })}
      />,
    );
    return drawn;
  }

  it('shows a row per source with badges, what waits, and the heading above "Needs you"', () => {
    const drawn = draw(() => undefined);
    const headings = find(drawn.root, (el) => el.localName === 'h3').map((h) =>
      h.textContent.trim(),
    );
    expect(headings.slice(0, 2)).toEqual(['While you were away', 'Needs you']);
    const rows = byClass(drawn.root, 'hb-away-row');
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['leet', 'raid', 'games']);
    const text = visibleText(drawn.root);
    expect(text).toContain('Daily gifts');
    expect(text).toContain('Valley Games');
    expect(text).toContain('2 trips and 1 job are waiting for you');
  });

  it('dismisses with the last payout it showed, and waits while an action runs', () => {
    const onDismiss = vi.fn();
    const drawn = draw(onDismiss);
    const [button] = byName(drawn.root, 'button', 'Got it');
    expect(button).toBeDefined();
    drawn.click(button as never);
    expect(onDismiss).toHaveBeenCalledWith(AWAY_SAMPLE.until);
    page?.unmount();
    const busy = draw(onDismiss, true);
    const [waiting] = byName(busy.root, 'button', 'Got it');
    expect(waiting?.hasAttribute('disabled')).toBe(true);
  });

  it('is not drawn when nothing was recorded', () => {
    const drawn = createPage();
    page = drawn;
    drawn.draw(
      <HomePage
        input={homeInput('busy', true)}
        settings={DEFAULT_BOARD_SETTINGS}
        onGo={() => undefined}
      />,
    );
    expect(byClass(drawn.root, 'hb-away')).toHaveLength(0);
    expect(visibleText(drawn.root)).not.toContain('While you were away');
  });
});
