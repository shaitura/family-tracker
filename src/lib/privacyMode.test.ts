import { describe, it, expect } from 'vitest';
import { formatShare, moneyOrShare } from './privacyMode';

describe('formatShare', () => {
  it('rounds to a whole percent', () => {
    expect(formatShare(183_000, 1_000_000)).toBe('18%');
  });

  it('a small but non-zero share is "<1%", never "0%"', () => {
    expect(formatShare(1_000, 1_000_000)).toBe('<1%');
  });

  it('zero is 0%', () => {
    expect(formatShare(0, 1_000_000)).toBe('0%');
  });

  it('the whole is 100%', () => {
    expect(formatShare(500, 500)).toBe('100%');
  });

  it('a zero or negative whole has no share', () => {
    expect(formatShare(10, 0)).toBe('—');
    expect(formatShare(10, -5)).toBe('—');
  });

  it('never contains a shekel sign or the underlying digits', () => {
    const out = formatShare(987_654, 1_234_567);
    expect(out).not.toMatch(/₪/);
    expect(out).not.toContain('987');
  });
});

describe('moneyOrShare', () => {
  it('shows the amount in normal mode', () => {
    expect(moneyOrShare(false, 2500, 10000)).toBe('₪2,500');
  });

  it('shows only the share in percent mode', () => {
    expect(moneyOrShare(true, 2500, 10000)).toBe('25%');
  });
});
