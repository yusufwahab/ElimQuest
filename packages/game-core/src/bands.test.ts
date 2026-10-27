import { describe, expect, it } from 'vitest';
import { BANDS, bandOfLevel, describeLevels, difficultyOf, difficultyRange, parseLevel } from './bands';

describe('difficulty bands', () => {
  it('cover every stored level 1–10 exactly once', () => {
    for (let l = 1; l <= 10; l++) expect(BANDS.filter((b) => l >= b.min && l <= b.max)).toHaveLength(1);
    expect(bandOfLevel(1).name).toBe('Beginner'); expect(bandOfLevel(6).name).toBe('Intermediate');
    expect(bandOfLevel(8).name).toBe('Advanced'); expect(bandOfLevel(10).name).toBe('Scholar');
  });
  it('imports accept band names or 1–10 and reject the rest', () => {
    expect(parseLevel('Scholar')).toBe(9); expect(parseLevel(' beginner ')).toBe(2); expect(parseLevel('7')).toBe(7);
    for (const bad of ['', '0', '11', '2.5', 'easy', undefined]) expect(parseLevel(bad)).toBeNull();
  });
  it('describes ranges in words', () => {
    expect(describeLevels(1, 10)).toBe('All difficulties'); expect(describeLevels(1, 6)).toBe('Beginner to Intermediate'); expect(describeLevels(9, 10)).toBe('Scholar');
    expect(difficultyOf(1, 10)).toBe('mixed'); expect(difficultyOf(4, 6)).toBe('intermediate'); expect(difficultyOf(2, 3)).toBeNull();
    expect(difficultyRange('scholar')).toEqual([9, 10]); expect(difficultyRange('mixed')).toEqual([1, 10]);
  });
});
