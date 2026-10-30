/**
 * One place for how money and units are shown. Every tab used to format
 * amounts on its own, so the same rupee total appeared as ₹2,53,850 on Home,
 * ₹253,850 on Reports and 83,847.33 on a season card.
 */

/** Whole rupees, Indian digit grouping, minus sign before the symbol: -₹1,234. */
export function formatMoney(amount: number, currency: string = '₹'): string {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  const digits = Math.abs(rounded).toLocaleString('en-IN');
  return `${rounded < 0 ? '-' : ''}${currency}${digits}`;
}

/** formatMoney with an explicit + on positive amounts, for balances. */
export function formatSignedMoney(amount: number, currency: string = '₹'): string {
  const text = formatMoney(amount, currency);
  return Math.round(amount) > 0 ? `+${text}` : text;
}

/** "acres" → "acre", so labels read "cost per acre", not "cost per acres". */
export function singularUnit(unit: string | undefined): string {
  if (!unit) return 'acre';
  const u = unit.trim();
  if (/^acres$/i.test(u)) return 'acre';
  if (/^hectares$/i.test(u)) return 'hectare';
  if (/^bighas$/i.test(u)) return 'bigha';
  if (/^cents$/i.test(u)) return 'cent';
  return u;
}
