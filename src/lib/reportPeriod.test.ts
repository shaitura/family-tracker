import { describe, it, expect } from 'vitest';
import { buildPeriod, periodMonths, inPeriod, priorPeriod, periodLabel } from './reportPeriod';

const NOW = new Date(2026, 6, 15); // 2026-07-15

describe('buildPeriod', () => {
  it('currentMonth', () => {
    const p = buildPeriod('currentMonth', { now: NOW });
    expect(p.startMonth).toBe('2026-07');
    expect(p.endMonth).toBe('2026-07');
    expect(p.isAllTime).toBe(false);
  });

  it('selectedYear', () => {
    const p = buildPeriod('selectedYear', { now: NOW, year: '2025' });
    expect(p.startMonth).toBe('2025-01');
    expect(p.endMonth).toBe('2025-12');
  });

  it('lastQuarter is 3 months ending this month', () => {
    const p = buildPeriod('lastQuarter', { now: NOW });
    expect(p.startMonth).toBe('2026-05');
    expect(p.endMonth).toBe('2026-07');
  });

  it('last12 spans a year boundary correctly', () => {
    const p = buildPeriod('last12', { now: new Date(2026, 1, 10) }); // 2026-02
    expect(p.startMonth).toBe('2025-03');
    expect(p.endMonth).toBe('2026-02');
  });

  it('last18', () => {
    const p = buildPeriod('last18', { now: NOW });
    expect(p.startMonth).toBe('2025-02');
    expect(p.endMonth).toBe('2026-07');
  });

  it('allTime has no start/end', () => {
    const p = buildPeriod('allTime', { now: NOW });
    expect(p.isAllTime).toBe(true);
  });

  it('custom range normalizes reversed input', () => {
    const p = buildPeriod('custom', { customStart: '2026-09', customEnd: '2025-11' });
    expect(p.startMonth).toBe('2025-11');
    expect(p.endMonth).toBe('2026-09');
  });
});

describe('periodMonths', () => {
  it('cross-year custom range', () => {
    const p = buildPeriod('custom', { customStart: '2025-11', customEnd: '2026-02' });
    expect(periodMonths(p)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('allTime returns empty (caller skips date filtering)', () => {
    const p = buildPeriod('allTime', { now: NOW });
    expect(periodMonths(p)).toEqual([]);
  });
});

describe('inPeriod', () => {
  it('matches inside range', () => {
    const p = buildPeriod('selectedYear', { now: NOW, year: '2026' });
    expect(inPeriod('2026-03-15', p)).toBe(true);
    expect(inPeriod('2025-12-31', p)).toBe(false);
  });

  it('allTime always matches', () => {
    const p = buildPeriod('allTime', { now: NOW });
    expect(inPeriod('2019-01-01', p)).toBe(true);
  });
});

describe('priorPeriod', () => {
  it('equal-length window immediately before', () => {
    const p = buildPeriod('custom', { customStart: '2026-05', customEnd: '2026-07' }); // 3 months
    const prior = priorPeriod(p);
    expect(prior.startMonth).toBe('2026-02');
    expect(prior.endMonth).toBe('2026-04');
  });

  it('single month prior is the month before', () => {
    const p = buildPeriod('currentMonth', { now: NOW });
    const prior = priorPeriod(p);
    expect(prior.startMonth).toBe('2026-06');
    expect(prior.endMonth).toBe('2026-06');
  });
});

describe('periodLabel', () => {
  it('selectedYear shows the year', () => {
    expect(periodLabel(buildPeriod('selectedYear', { now: NOW, year: '2025' }))).toBe('2025');
  });
  it('single month shows the month', () => {
    expect(periodLabel(buildPeriod('currentMonth', { now: NOW }))).toBe('2026-07');
  });
  it('range shows an arrow', () => {
    const p = buildPeriod('custom', { customStart: '2025-11', customEnd: '2026-02' });
    expect(periodLabel(p)).toBe('2025-11 → 2026-02');
  });
  it('allTime', () => {
    expect(periodLabel(buildPeriod('allTime', { now: NOW }))).toBe('כל הזמן');
  });
});
