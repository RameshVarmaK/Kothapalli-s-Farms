/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReactNode } from 'react';
import { LayoutDashboard, FileText, PackageOpen, CalendarDays, Coins, Users, Wrench, Sprout, CreditCard, BarChart3 } from 'lucide-react';

export type TabId = 'dashboard' | 'money' | 'stock' | 'timeline' | 'settle' | 'members' | 'settings' | 'credits' | 'analytics';

export interface TabDef {
  id: TabId;
  label: string;
  icon: ReactNode;
}

export interface TabGroup {
  id: string;
  label: string;
  icon: ReactNode;
  tabs: TabDef[];
}

// Nine flat tabs collapse into four hubs (Home / Money / Farm / More). Basic
// mode shows only the hubs; Power mode shows every leaf tab grouped under
// the same hubs. Mobile always uses the hub-level bottom bar, with the full
// grouped list one tap away in the drawer.
export const TAB_GROUPS: TabGroup[] = [
  {
    id: 'grp-home',
    label: 'Home',
    icon: <LayoutDashboard size={18} className="shrink-0" />,
    tabs: [{ id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} className="shrink-0" /> }]
  },
  {
    id: 'grp-money',
    label: 'Money',
    icon: <Coins size={18} className="shrink-0" />,
    tabs: [
      { id: 'money', label: 'Transactions', icon: <FileText size={17} className="shrink-0" /> },
      { id: 'settle', label: 'Settle Bilateral', icon: <Coins size={17} className="shrink-0" /> },
      { id: 'credits', label: 'Credit & Payables', icon: <CreditCard size={17} className="shrink-0" /> }
    ]
  },
  {
    id: 'grp-farm',
    label: 'Farm',
    icon: <Sprout size={18} className="shrink-0" />,
    tabs: [
      { id: 'timeline', label: 'Farm Activity', icon: <CalendarDays size={17} className="shrink-0" /> },
      { id: 'stock', label: 'Inventory', icon: <PackageOpen size={17} className="shrink-0" /> },
      { id: 'members', label: 'Fields & Directory', icon: <Users size={17} className="shrink-0" /> }
    ]
  },
  {
    id: 'grp-more',
    label: 'More',
    icon: <Wrench size={18} className="shrink-0" />,
    tabs: [
      { id: 'analytics', label: 'Reports & Insights', icon: <BarChart3 size={17} className="shrink-0" /> },
      { id: 'settings', label: 'Audit & Config', icon: <Wrench size={17} className="shrink-0" /> }
    ]
  }
];

export function groupForTab(tabId: TabId): TabGroup {
  return TAB_GROUPS.find(g => g.tabs.some(t => t.id === tabId)) || TAB_GROUPS[0];
}
