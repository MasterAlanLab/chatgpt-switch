import { describe, expect, it } from 'vitest';
import { menuPosition } from '../lib/menu-position';

describe('Floating account menu placement', () => {
  const menu = { width: 128, height: 80 };
  const viewport = { width: 420, height: 600 };
  it('opens below a trigger when there is enough room', () => {
    expect(menuPosition({ top: 300, bottom: 325, right: 380 }, menu, viewport)).toEqual({
      top: 331,
      left: 252,
    });
  });
  it('flips above the trigger near the bottom edge', () => {
    expect(menuPosition({ top: 550, bottom: 575, right: 380 }, menu, viewport)).toEqual({
      top: 464,
      left: 252,
    });
  });
  it('keeps the entire menu inside narrow and short viewports', () => {
    expect(
      menuPosition({ top: 70, bottom: 95, right: 12 }, menu, { width: 160, height: 120 }),
    ).toEqual({ top: 8, left: 8 });
    expect(menuPosition({ top: 550, bottom: 575, right: 500 }, menu, viewport).left).toBe(284);
  });
});
