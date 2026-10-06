/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLanguage } from '../../hooks/useLanguage';
import { useViewMode } from '../../hooks/useViewMode';
import { TabId, TAB_GROUPS, groupForTab } from '../../app/navigation';

interface NavProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

/** Phone bottom bar: always the 4 hubs, regardless of Basic/Power mode. */
export function MobileBottomNav({ activeTab, setActiveTab }: NavProps) {
  const { t } = useLanguage();
  const activeGroup = groupForTab(activeTab);
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-300 p-2 flex gap-1.5 justify-around md:hidden print:hidden shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
      {TAB_GROUPS.map(group => (
        <button
          key={group.id}
          onClick={() => setActiveTab(group.tabs[0].id)}
          className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl text-[10px] font-semibold tracking-wide transition-all flex-1 min-h-12 justify-center border ${
            activeGroup.id === group.id
              ? 'bg-slate-100 text-slate-900 font-bold border-slate-200'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
          }`}
        >
          {group.icon}
          <span>{t(group.label)}</span>
        </button>
      ))}
    </nav>
  );
}

/** Desktop sidebar: the 4 hubs in Basic mode, every tab grouped in Power mode. */
export function DesktopSidebarNav({ activeTab, setActiveTab }: NavProps) {
  const { mode } = useViewMode();
  const { t } = useLanguage();
  const activeGroup = groupForTab(activeTab);
  return (
    <nav className="hidden md:flex md:flex-col md:w-64 md:border-r md:border-slate-200 md:gap-1.5 md:p-4 print:hidden shrink-0">
      {mode === 'basic' ? (
        TAB_GROUPS.map(group => (
          <button
            key={group.id}
            onClick={() => setActiveTab(group.tabs[0].id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all w-full text-left cursor-pointer border border-l-4 ${
              activeGroup.id === group.id
                ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 border-l-emerald-600'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
            }`}
          >
            {group.icon}
            <span>{t(group.label)}</span>
          </button>
        ))
      ) : (
        TAB_GROUPS.map((group, idx) => (
          <div key={group.id}>
            {idx > 0 && <div className="border-t border-slate-200 my-3 pt-3" />}
            <div className="px-3 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {t(group.label)}
            </div>
            {group.tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all w-full text-left cursor-pointer border border-l-4 ${
                  activeTab === tab.id
                    ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 border-l-emerald-600'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
                }`}
              >
                {tab.icon}
                <span>{t(tab.label)}</span>
              </button>
            ))}
          </div>
        ))
      )}
    </nav>
  );
}

/** Basic mode's pills for the tabs inside the active hub. */
export function GroupTabSwitcher({ activeTab, setActiveTab }: NavProps) {
  const { mode } = useViewMode();
  const { t } = useLanguage();
  const activeGroup = groupForTab(activeTab);
  if (!(mode === 'basic' && activeGroup.tabs.length > 1)) return null;
  return (
    <div data-testid="group-tab-switcher" className="flex flex-wrap gap-2 mb-5">
      {activeGroup.tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === tab.id
              ? 'bg-emerald-600 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
          }`}
        >
          {t(tab.label)}
        </button>
      ))}
    </div>
  );
}
