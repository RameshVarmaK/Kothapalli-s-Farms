import React, { useState } from 'react';
import { History, CheckCircle, AlertCircle, Clock, Trash2 } from 'lucide-react';
import { NotificationDelivery, NotificationEvent } from '../types';

interface NotificationDeliveryLogProps {
  deliveries: NotificationDelivery[];
  onClear?: () => void;
  showFilters?: boolean;
}

const EVENT_EMOJI: Record<NotificationEvent, string> = {
  expense_added: '💰',
  harvest_recorded: '🌾',
  settlement_calculated: '📊',
  labour_logged: '👷',
};

const CHANNEL_LABEL: Record<string, string> = {
  sms: '📱 SMS',
  whatsapp: '💬 WhatsApp',
  none: '⊘ Disabled',
};

export function NotificationDeliveryLog({ deliveries, onClear, showFilters = false }: NotificationDeliveryLogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(deliveries.length / itemsPerPage);
  const paginatedDeliveries = deliveries.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-50 border-green-200';
      case 'failed':
        return 'bg-red-50 border-red-200';
      case 'pending':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-slate-50 border-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle size={18} className="text-green-600" />;
      case 'failed':
        return <AlertCircle size={18} className="text-red-600" />;
      case 'pending':
        return <Clock size={18} className="text-yellow-600 animate-spin" />;
      default:
        return null;
    }
  };

  if (deliveries.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <History size={20} className="text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-900">Notification History</h3>
        </div>
        <p className="text-sm text-slate-500 text-center py-8">
          No notifications sent yet
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <History size={20} className="text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            Notification History ({deliveries.length})
          </h3>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <Trash2 size={14} />
            Clear Old
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {paginatedDeliveries.map(delivery => (
          <div
            key={delivery.id}
            className={`border rounded-lg p-4 transition-all ${getStatusColor(delivery.status)}`}
          >
            <button
              onClick={() => setExpandedId(expandedId === delivery.id ? null : delivery.id)}
              className="w-full text-left flex items-start gap-3"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {getStatusIcon(delivery.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <span>{EVENT_EMOJI[delivery.eventType]}</span>
                    {delivery.eventType.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {CHANNEL_LABEL[delivery.channel]} • {new Date(delivery.sentAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                delivery.status === 'sent'
                  ? 'bg-green-100 text-green-700'
                  : delivery.status === 'failed'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {delivery.status}
              </span>
            </button>

            {expandedId === delivery.id && (
              <div className="mt-3 pt-3 border-t border-current border-opacity-20 space-y-2">
                <p className="text-sm text-slate-700">
                  <strong>Message:</strong> {delivery.message}
                </p>
                {delivery.errorMessage && (
                  <p className="text-xs text-red-600">
                    <strong>Error:</strong> {delivery.errorMessage}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500 font-medium">
            Showing {currentPage * itemsPerPage + 1} to {Math.min((currentPage + 1) * itemsPerPage, deliveries.length)} of {deliveries.length}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="px-3 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i)}
                  className={`w-8 h-8 text-xs font-semibold rounded-lg transition-colors ${
                    currentPage === i
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage === totalPages - 1}
              className="px-3 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
