import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate } from './formatting';

describe('formatCurrency', () => {
  it('should format positive numbers to PEN currency format', () => {
    // Note: The spaces in Intl.NumberFormat can sometimes be tricky depending on Node version, 
    // replacing non-breaking spaces for a generic match might be needed, but we keep it simple here.
    const result = formatCurrency(1500.5);
    expect(result).toMatch(/1,500\.50/);
    expect(result).toContain('S/');
  });

  it('should handle undefined correctly', () => {
    expect(formatCurrency(undefined)).toBe('S/ 0.00');
  });

  it('should handle null correctly', () => {
    expect(formatCurrency(null as any)).toBe('S/ 0.00');
  });

  it('should handle NaN correctly', () => {
    expect(formatCurrency(NaN)).toBe('S/ 0.00');
  });
});

describe('formatDate', () => {
  it('should format a valid date string correctly', () => {
    // Assuming the timezone doesn't shift the day locally for this test or using UTC
    const result = formatDate('2026-03-20T12:00:00Z');
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
