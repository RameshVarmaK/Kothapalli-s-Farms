import type { LocalDatabase } from '../src/utils/database';

/**
 * A small made-up farm for trying the app by hand. Nothing here is real data.
 */
export function sandboxSeed(): LocalDatabase {
  return {
    members: [
      { id: 'm1', name: 'Ramesh' },
      { id: 'm2', name: 'Ganapathi' },
      { id: 'm3', name: 'Subba' },
    ],
    fields: [
      { id: 'f1', name: 'North Field', area: 2.5, shares: [{ memberId: 'm1', percentage: 50 }, { memberId: 'm2', percentage: 50 }] },
      { id: 'f2', name: 'South Field', area: 1.5, shares: [{ memberId: 'm1', percentage: 40 }, { memberId: 'm2', percentage: 30 }, { memberId: 'm3', percentage: 30 }] },
    ],
    seasons: [
      { id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false },
      { id: 's2', fieldId: 'f2', cropName: 'Cotton', startDate: '2026-06-10', isClosed: false },
    ],
    activities: [],
    expenses: [
      { id: 'e1', date: '2026-06-05', amount: 4000, paidByMemberId: 'm1', category: 'Seed', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
      {
        id: 'e2', date: '2026-06-12', amount: 3000, paidByMemberId: 'm2', category: 'Tractor hire', targetType: 'common', commonAllocationRule: 'equal',
        allocations: [{ fieldId: 'f1', seasonId: 's1', amount: 1500 }, { fieldId: 'f2', seasonId: 's2', amount: 1500 }],
      },
    ],
    labours: [
      {
        id: 'l1', date: '2026-06-20', targetType: 'single', fieldId: 'f1', seasonId: 's1', description: 'Transplanting', workersCount: 8,
        wageRate: 300, totalCost: 2400, paidByMemberId: '', isCredit: true, creditAccountId: 'c1',
      },
    ],
    stockItems: [],
    purchases: [],
    usages: [],
    revenues: [],
    auditLogs: [],
    creditAccounts: [{ id: 'c1', name: 'Palem labour', type: 'Labour' }],
    creditRepayments: [],
    settlementClearances: [],
    settings: { currency: '₹', areaUnit: 'acres', googleDriveLinked: false },
  } as LocalDatabase;
}
