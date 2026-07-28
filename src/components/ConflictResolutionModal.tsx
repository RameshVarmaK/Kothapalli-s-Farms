import { LocalDatabase } from '../utils/database';
import { AlertTriangle, Check, X } from 'lucide-react';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  localData: LocalDatabase;
  cloudData: LocalDatabase;
  onResolve: (resolution: 'local' | 'cloud' | 'merge') => void;
  onCancel: () => void;
}

export function ConflictResolutionModal({
  isOpen,
  localData,
  cloudData,
  onResolve,
  onCancel
}: ConflictResolutionModalProps) {
  if (!isOpen) return null;

  const getConflictSummary = () => {
    const issues = [];

    // Compare member counts
    if ((localData.members?.length || 0) !== (cloudData.members?.length || 0)) {
      issues.push(`Members: local has ${localData.members?.length || 0}, cloud has ${cloudData.members?.length || 0}`);
    }

    // Compare fields
    if ((localData.fields?.length || 0) !== (cloudData.fields?.length || 0)) {
      issues.push(`Fields: local has ${localData.fields?.length || 0}, cloud has ${cloudData.fields?.length || 0}`);
    }

    // Compare seasons
    if ((localData.seasons?.length || 0) !== (cloudData.seasons?.length || 0)) {
      issues.push(`Seasons: local has ${localData.seasons?.length || 0}, cloud has ${cloudData.seasons?.length || 0}`);
    }

    // Compare expenses
    if ((localData.expenses?.length || 0) !== (cloudData.expenses?.length || 0)) {
      issues.push(`Expenses: local has ${localData.expenses?.length || 0}, cloud has ${cloudData.expenses?.length || 0}`);
    }

    return issues;
  };

  const conflicts = getConflictSummary();

  return (
    <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle size={24} className="text-amber-600" />
            <h3 className="text-lg font-extrabold text-slate-900">Data Conflict Detected</h3>
          </div>
          <p className="text-sm text-slate-600">
            Your local changes differ from the Google Sheet. Choose how to resolve this.
          </p>
        </div>

        <div className="p-6 space-y-4 max-h-64 overflow-y-auto">
          {conflicts.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Differences Found:</p>
              <div className="bg-amber-50 rounded-lg border border-amber-100 p-3 space-y-1">
                {conflicts.map((issue, i) => (
                  <div key={i} className="text-xs text-amber-900 font-medium">• {issue}</div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">No major differences detected in counts.</div>
          )}

          <div className="pt-2 space-y-3 text-sm">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
              <p className="font-semibold text-blue-900 mb-1">💾 Keep Local Changes</p>
              <p className="text-blue-800 text-xs">Keep your unsync'd edits. Upload them to the Sheet next.</p>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <p className="font-semibold text-emerald-900 mb-1">☁️ Accept Cloud Version</p>
              <p className="text-emerald-800 text-xs">Discard local changes and use the Google Sheet data.</p>
            </div>

            <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
              <p className="font-semibold text-purple-900 mb-1">🔄 Smart Merge</p>
              <p className="text-purple-800 text-xs">Keep new local entries, accept cloud updates for existing items.</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-all cursor-pointer"
          >
            <X size={14} className="inline mr-1" />
            Cancel
          </button>

          <button
            onClick={() => onResolve('local')}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-blue-900 bg-blue-100 hover:bg-blue-200 rounded-lg transition-all cursor-pointer border border-blue-200"
          >
            <Check size={14} className="inline mr-1" />
            Keep Local
          </button>

          <button
            onClick={() => onResolve('cloud')}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-all cursor-pointer border border-emerald-200"
          >
            <Check size={14} className="inline mr-1" />
            Use Cloud
          </button>

          <button
            onClick={() => onResolve('merge')}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-purple-900 bg-purple-100 hover:bg-purple-200 rounded-lg transition-all cursor-pointer border border-purple-200"
          >
            <Check size={14} className="inline mr-1" />
            Merge
          </button>
        </div>
      </div>
    </div>
  );
}
