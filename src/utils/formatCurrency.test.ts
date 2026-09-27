import { describe, it, expect } from 'vitest';
import { formatCurrency } from './index';

describe('formatCurrency', () => {
  it('formats a positive amount with the shekel sign', () => {
    expect(formatCurrency(971265)).toBe('₪971,265');
  });

  it('keeps the minus on a deficit — it used to read as a surplus', () => {
    expect(formatCurrency(-971265)).toBe('-₪971,265');
  });

  it('a deficit and a surplus of the same size are not the same string', () => {
    expect(formatCurrency(-8000)).not.toBe(formatCurrency(8000));
  });

  it('zero has no sign', () => {
    expect(formatCurrency(0)).toBe('₪0');
  });

  it('a value that rounds to zero does not render as -₪0', () => {
    expect(formatCurrency(-0.4)).toBe('₪0');
  });

  it('rounds the sign and the digits consistently', () => {
    expect(formatCurrency(-0.6)).toBe('-₪1');
  });
});
