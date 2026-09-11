import { X } from 'lucide-react';
import React from 'react';

interface NavTab {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  tabs: NavTab[];
}

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  groups: NavGroup[];
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export function MobileNavDrawer({
  isOpen,
  onClose,
  groups,
  activeTab,
  onSelectTab
}: MobileNavDrawerProps) {
  const handleTabClick = (tabId: string) => {
    onSelectTab(tabId);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 shadow-xl z-40 md:hidden transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Menu</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-600" />
          </button>
        </div>

        {/* Navigation Items, grouped under the same 4 hubs as the desktop nav */}
        <nav className="p-4 overflow-y-auto">
          {groups.map((group, idx) => (
            <div key={group.id} className={idx > 0 ? 'mt-4' : ''}>
              <div className="px-4 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-semibold transition-all ${
                      activeTab === tab.id
                        ? 'bg-emerald-50 text-emerald-700 border-l-4 border-l-emerald-600'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xl">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </>
  );
}
