import { describe, expect, it } from 'vitest';
import { buildMetaTags, buildRows, publishBuildInfo, readBuildInfo } from './build-info';

const SHA = 'a'.repeat(40);

describe('buildMetaTags', () => {
  it('publishes the branch, the commit and the environment', () => {
    expect(buildMetaTags({ environment: 'staging', version: SHA, branch: 'feat/shell' })).toEqual([
      { name: 'build-branch', content: 'feat/shell' },
      { name: 'build-commit', content: SHA },
      { name: 'build-environment', content: 'staging' },
    ]);
  });

  it('leaves out what is missing or not plainly shaped', () => {
    expect(buildMetaTags({ environment: 'production', version: 'dev', branch: null })).toEqual([
      { name: 'build-environment', content: 'production' },
    ]);
    expect(
      buildMetaTags({ environment: 'x y', version: SHA, branch: '<script>alert(1)</script>' }),
    ).toEqual([{ name: 'build-commit', content: SHA }]);
  });
});

class Meta {
  attrs = new Map<string, string>();
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
}

function fakeDoc() {
  const metas: Meta[] = [];
  return {
    metas,
    head: { appendChild: (node: Meta) => metas.push(node) },
    createElement: (): Meta => new Meta(),
    querySelector: (selector: string): Meta | null => {
      const name = /name="([^"]+)"/.exec(selector)?.[1];
      return metas.find((m) => m.getAttribute('name') === name) ?? null;
    },
  };
}

describe('publishBuildInfo', () => {
  it('adds the tags once and updates them on a second call', () => {
    const doc = fakeDoc();
    publishBuildInfo(doc, { environment: 'staging', version: SHA, branch: 'a' });
    publishBuildInfo(doc, { environment: 'staging', version: 'b'.repeat(40), branch: 'b' });
    expect(doc.metas).toHaveLength(3);
    expect(readBuildInfo(doc)).toEqual({
      branch: 'b',
      commit: 'b'.repeat(40),
      environment: 'staging',
    });
  });

  it('reads nothing from a page without the tags', () => {
    expect(readBuildInfo(fakeDoc())).toEqual({ branch: null, commit: null, environment: null });
  });
});

describe('buildRows', () => {
  it('shows what is known, the commit shortened', () => {
    expect(buildRows({ branch: 'feat/x', commit: SHA, environment: 'staging' })).toEqual([
      { label: 'Environment', value: 'staging' },
      { label: 'Branch', value: 'feat/x' },
      { label: 'Commit', value: 'aaaaaaaaaaaa' },
    ]);
    expect(buildRows({ branch: null, commit: null, environment: null })).toEqual([]);
  });
});
