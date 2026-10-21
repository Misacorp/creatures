import { describe, expect, it } from 'vitest';
import { conversionDurationFor, conversionViews, shortText } from './conversion-view';
import { parseJobResult } from './gear-parse';
import { jobTitle, jobVerb } from './gear-view';

describe('conversion views', () => {
  it('lists only recipes whose supply is in stock, refine and recycle apart', () => {
    expect(conversionViews('refine', {}, {})).toEqual([]);
    const stock = { 'lure-basic': 2, 'satchel-great': 1 };
    expect(conversionViews('refine', stock, {}).map((v) => v.id)).toEqual(['refine-lure-basic']);
    expect(conversionViews('recycle', stock, {}).map((v) => v.id)).toEqual([
      'recycle-satchel-great',
    ]);
  });

  it('gives have and need for each input and the outputs, and says what is short', () => {
    const [view] = conversionViews('refine', { 'lure-basic': 2 }, {});
    expect(view?.verb).toBe('Refine');
    expect(view?.level).toBe(3);
    expect(view?.inputs.map((i) => [i.amount, i.have])).toEqual([[3, 2]]);
    expect(view?.outputs.map((o) => o.amount)).toEqual([1]);
    expect(shortText(view?.inputs ?? [])).toBe('Needs 1 more Plain Lure.');
    const [full] = conversionViews('refine', { 'lure-basic': 3 }, {});
    expect(shortText(full?.inputs ?? [])).toBeNull();
  });

  it('lists a recycle with parts as outputs and no Bait', () => {
    const [view] = conversionViews('recycle', { 'map-scrap-great': 1 }, {});
    expect(view?.verb).toBe('Recycle');
    expect(view?.outputs.map((o) => o.key)).toEqual(['scrap', 'tide-shard']);
  });

  it('times a conversion at a Crafting level like the server does', () => {
    expect(conversionDurationFor('refine-lure-basic', 1)).toBe(2 * 3_600_000);
    expect(conversionDurationFor('refine-lure-basic', 3)).toBeLessThan(2 * 3_600_000);
    expect(conversionDurationFor('nope', 1)).toBe(0);
  });
});

describe('conversion jobs in the Workshop view', () => {
  it('names the job and its verb from the recipe', () => {
    expect(jobVerb('convert', { recipeId: 'refine-lure-basic' })).toBe('Refine');
    expect(jobVerb('convert', { recipeId: 'recycle-lure-good' })).toBe('Recycle');
    expect(jobTitle({ kind: 'convert', input: { recipeId: 'refine-lure-basic' } })).toBe(
      'Refine Plain Lure',
    );
    expect(jobTitle({ kind: 'convert', input: { recipeId: 'recycle-lure-good' } })).toBe(
      'Recycle Sweet Lure',
    );
  });

  it('accepts a convert result and refuses a malformed one', () => {
    const result = {
      kind: 'convert',
      recipeId: 'refine-lure-basic',
      took: { supplies: { 'lure-basic': 3 }, parts: {} },
      gave: { supplies: { 'lure-good': 1 }, parts: {} },
      xp: 24,
      skillXp: 40,
      skillLevel: 1,
      leveledUp: false,
    };
    expect(parseJobResult(result)).toMatchObject({ kind: 'convert' });
    expect(() => parseJobResult({ ...result, gave: { supplies: { a: -1 }, parts: {} } })).toThrow(
      'job result',
    );
    expect(() => parseJobResult({ ...result, took: null })).toThrow('job result');
  });
});
