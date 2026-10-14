import { describe, expect, it } from 'vitest';
import { FEEDBACK_LABEL, ISSUES_URL, buildFeedback, clipboardText, issueUrl } from './feedback';
import { requireEntry } from './registry';

const timer = requireEntry('TimerBar');

const LINK = 'https://creatures-staging.misacorp.dev/workbench.html#c=TimerBar&w=390&bg=dusk';

function sample(props = { ...timer.defaults, percent: 75 }) {
  return buildFeedback({ entry: timer, props, width: '390', link: LINK });
}

describe('feedback text', () => {
  it('names the component, file, props, width and link, and leaves a line to fill in', () => {
    const feedback = sample();
    expect(feedback.title).toBe('UI: TimerBar');
    expect(feedback.body).toContain('Component: TimerBar');
    expect(feedback.body).toContain('File: apps/activity/src/ui/TimerBar.tsx');
    expect(feedback.body).toContain('Preview width: 390');
    expect(feedback.body).toContain(`Workbench link: ${LINK}`);
    expect(feedback.body).toContain('"percent": 75');
    expect(feedback.body.trimEnd().endsWith("What I'd like changed:")).toBe(true);
  });

  it('shows the props that changed, as JSON that parses', () => {
    const json = /```json\n([\s\S]*?)\n```/.exec(sample().body)?.[1];
    expect(JSON.parse(json ?? 'x')).toEqual({ percent: 75 });
  });

  it('stays under about 6 KB even with long text', () => {
    const props = { ...timer.defaults, state: 'x'.repeat(500), label: 'y'.repeat(500) };
    const feedback = buildFeedback({
      entry: timer,
      props,
      width: '390',
      link: `${LINK}${'z'.repeat(8000)}`,
    });
    expect(feedback.body.length).toBeLessThan(6100);
    // Cutting never takes away the line Misa fills in.
    expect(feedback.body.trimEnd().endsWith("What I'd like changed:")).toBe(true);
  });

  it('copies the title and the body', () => {
    const feedback = sample();
    expect(clipboardText(feedback)).toBe(`${feedback.title}\n\n${feedback.body}`);
  });
});

describe('the new issue link', () => {
  it('points at the game repository with the label, and encodes the title and body', () => {
    const feedback = sample();
    const url = new URL(issueUrl(feedback));
    expect(`${url.origin}${url.pathname}`).toBe(ISSUES_URL);
    expect(url.searchParams.get('labels')).toBe(FEEDBACK_LABEL);
    expect(url.searchParams.get('title')).toBe('UI: TimerBar');
    expect(url.searchParams.get('body')).toBe(feedback.body);
    // Newlines, braces and the hash of the workbench link are all encoded.
    expect(issueUrl(feedback)).not.toMatch(/[\n #{}"]/);
  });

  it('keeps the whole link short enough for GitHub, and never splits an emoji', () => {
    const body = `${'\u{1F600}'.repeat(3000)}\nWhat I'd like changed: `;
    const url = issueUrl({ title: 'UI: Test', body });
    expect(url.length).toBeLessThan(7600);
    expect(() => decodeURIComponent(url)).not.toThrow();
    expect(
      new URL(url).searchParams.get('body')?.trimEnd().endsWith("What I'd like changed:"),
    ).toBe(true);
  });
});
