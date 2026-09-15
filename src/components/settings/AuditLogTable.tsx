/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FileText } from 'lucide-react';
import { AuditLog } from '../../types';

interface AuditLogTableProps {
  auditLogs: AuditLog[];
}

export const AuditLogTable: React.FC<AuditLogTableProps> = ({ auditLogs }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-slate-400" />
          <h3 className="font-bold text-sm text-slate-800">Transactional Audit Logs</h3>
        </div>
        <span className="text-[10px] text-slate-450 font-bold bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider">Bookkeeping Log Trail</span>
      </div>

      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400 font-bold text-[9px] uppercase tracking-widest bg-slate-50/50">
              <th className="px-6 py-3">Timestamp</th>
              <th className="px-6 py-3">Action</th>
              <th className="px-6 py-3">EntityType</th>
              <th className="px-6 py-3">Change Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
            {auditLogs.map(log => {
              const dateClean = new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(log.timestamp).toLocaleDateString('en-IN');
              return (
                <tr key={log.id} className="hover:bg-slate-50/10">
                  <td className="px-6 py-3.5 font-bold text-[10px] text-slate-400 font-mono whitespace-nowrap">{dateClean}</td>
                  <td className="px-6 py-3.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                      log.actionType === 'create' ? 'bg-emerald-50 text-emerald-850 border-emerald-100' :
                      log.actionType === 'edit' ? 'bg-blue-50 text-blue-800 border-blue-100' :
                      'bg-red-50 text-red-800 border-red-100'
                    }`}>
                      {log.actionType}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 font-bold text-[10px] text-slate-700">{log.entityType}</td>
                  <td className="px-6 py-3.5 text-slate-500 leading-relaxed text-[11px]">{log.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
