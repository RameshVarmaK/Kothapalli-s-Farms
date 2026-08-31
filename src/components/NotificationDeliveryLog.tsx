import React, { useState } from 'react';
import { History, CheckCircle, AlertCircle, Clock, Trash2 } from 'lucide-react';
import { NotificationDelivery, NotificationEvent } from '../types';

interface NotificationDeliveryLogProps {
  deliveries: NotificationDelivery[];
  onClear?: () => void;
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

export function NotificationDeliveryLog({ deliveries, onClear }: NotificationDeliveryLogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        {deliveries.map(delivery => (
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
    </div>
  );
}
