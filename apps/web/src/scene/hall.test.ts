import { describe, expect, it, vi } from 'vitest';
import { roundedRect } from './hall';

describe('roundedRect (older phones have no ctx.roundRect)', () => {
  it('uses the native call when it exists', () => {
    const roundRect = vi.fn();
    roundedRect({ moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(), roundRect }, 1, 2, 30, 20, 3);
    expect(roundRect).toHaveBeenCalledWith(1, 2, 30, 20, 3);
  });
  it('draws the same shape with arcTo when it does not, and never throws', () => {
    const ctx = { moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn() };
    expect(() => roundedRect(ctx, 0, 0, 10, 4, 99)).not.toThrow();
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.arcTo).toHaveBeenCalledTimes(4);
    expect(ctx.arcTo.mock.calls[0]![4]).toBe(2);          // radius is clamped to half the shortest side
    expect(ctx.closePath).toHaveBeenCalled();
  });
});
