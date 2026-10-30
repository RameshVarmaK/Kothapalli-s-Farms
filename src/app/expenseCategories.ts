/**
 * The expense categories offered in the form. Free text produced near
 * duplicates ("Fertiliser", "fertilizer", "Fertilizer batch") that split the
 * Reports charts; a fixed list keeps them together. Categories already in
 * the ledger stay selectable so old entries keep their wording, and "Other"
 * opens a text box for anything new.
 */
export const OTHER_CATEGORY = 'Other';

export const EXPENSE_CATEGORIES: string[] = [
  'Seeds & Saplings',
  'Fertilizer',
  'Pesticide & Spraying',
  'Ploughing & Tractor',
  'Irrigation & Electricity',
  'Fuel',
  'Transport',
  'Harvesting',
  'Equipment & Repairs',
  'Land Lease',
  'Packaging & Market Fees',
];

/** The fixed list, then any other category already used, then Other last. */
export function categoryOptions(existing: Iterable<string>): string[] {
  const seen = new Set(EXPENSE_CATEGORIES.map(c => c.toLowerCase()));
  const extra: string[] = [];
  for (const raw of existing) {
    const value = (raw || '').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key) || key === OTHER_CATEGORY.toLowerCase()) continue;
    seen.add(key);
    extra.push(value);
  }
  extra.sort((a, b) => a.localeCompare(b));
  return [...EXPENSE_CATEGORIES, ...extra, OTHER_CATEGORY];
}
