import React, { useState } from 'react';
import { Bell, MessageCircle, Phone, AlertCircle, Check } from 'lucide-react';
import { NotificationPreferences, NotificationEvent, Member } from '../types';

interface NotificationPreferencesPanelProps {
  member: Member;
  preference: NotificationPreferences | null;
  onSave: (preferences: NotificationPreferences) => void;
  isSaving?: boolean;
}

const EVENT_LABELS: Record<NotificationEvent, string> = {
  expense_added: 'New Expense Logged',
  harvest_recorded: 'Harvest Recorded',
  settlement_calculated: 'Settlement Calculated',
  labour_logged: 'Labour Entry Added',
};

export function NotificationPreferencesPanel({
  member,
  preference,
  onSave,
  isSaving = false
}: NotificationPreferencesPanelProps) {
  const [channel, setChannel] = useState<'sms' | 'whatsapp' | 'none'>(
    preference?.channel || 'none'
  );
  const [phoneNumber, setPhoneNumber] = useState(preference?.phoneNumber || '');
  const [enabledEvents, setEnabledEvents] = useState<NotificationEvent[]>(
    preference?.enabledEvents || []
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const toggleEvent = (event: NotificationEvent) => {
    setEnabledEvents(prev =>
      prev.includes(event)
        ? prev.filter(e => e !== event)
        : [...prev, event]
    );
  };

  const handleSave = () => {
    setValidationError(null);
    setSuccessMessage(null);

    if (channel !== 'none' && !phoneNumber) {
      setValidationError('Phone number is required for SMS/WhatsApp notifications');
      return;
    }

    if (channel !== 'none' && !/^\+?[\d\s\-()]{10,}$/.test(phoneNumber)) {
      setValidationError('Please enter a valid phone number');
      return;
    }

    const preferences: NotificationPreferences = {
      memberId: member.id,
      channel,
      phoneNumber: channel !== 'none' ? phoneNumber : undefined,
      enabledEvents,
    };

    onSave(preferences);
    setSuccessMessage('Preferences saved successfully');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 sm:p-6 space-y-6" role="form" aria-label={`Notification preferences for ${member.name}`}>
      <div className="flex items-center gap-3 mb-4">
        <Bell size={20} className="text-emerald-600" />
        <h3 className="text-lg font-semibold text-slate-900">
          Notifications for {member.name}
        </h3>
      </div>

      {/* Channel Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-slate-700" id="channel-label">
          Notification Channel
        </label>
        <div className="space-y-2" role="group" aria-labelledby="channel-label">
          <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500">
            <input
              type="radio"
              value="none"
              checked={channel === 'none'}
              onChange={e => setChannel(e.target.value as any)}
              className="w-4 h-4 text-emerald-600"
              aria-label="Disable notifications"
            />
            <span className="flex-1 text-sm font-medium text-slate-700">
              Disabled - No notifications
            </span>
          </label>

          <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500">
            <input
              type="radio"
              value="sms"
              checked={channel === 'sms'}
              onChange={e => setChannel(e.target.value as any)}
              className="w-4 h-4 text-emerald-600"
              aria-label="Send notifications via SMS"
            />
            <Phone size={18} className="text-blue-600" aria-hidden="true" />
            <span className="flex-1 text-sm font-medium text-slate-700">
              SMS (Text Message)
            </span>
          </label>

          <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500">
            <input
              type="radio"
              value="whatsapp"
              checked={channel === 'whatsapp'}
              onChange={e => setChannel(e.target.value as any)}
              className="w-4 h-4 text-emerald-600"
              aria-label="Send notifications via WhatsApp"
            />
            <MessageCircle size={18} className="text-green-600" aria-hidden="true" />
            <span className="flex-1 text-sm font-medium text-slate-700">
              WhatsApp Message
            </span>
          </label>
        </div>
      </div>

      {/* Phone Number Input */}
      {channel !== 'none' && (
        <div className="space-y-2">
          <label htmlFor="phone-input" className="block text-sm font-semibold text-slate-700">
            Phone Number
          </label>
          <input
            id="phone-input"
            type="tel"
            value={phoneNumber}
            onChange={e => setPhoneNumber(e.target.value)}
            placeholder="+91 9876543210"
            inputMode="tel"
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Phone number for notifications"
            aria-describedby="phone-hint"
          />
          <p id="phone-hint" className="text-xs text-slate-500">
            Include country code (e.g., +91 for India)
          </p>
        </div>
      )}

      {/* Event Selection */}
      <div className="space-y-3">
        <label htmlFor="events-group" className="block text-sm font-semibold text-slate-700">
          Notify me when:
        </label>
        <div className="space-y-2" id="events-group" role="group" aria-label="Notification event types">
          {(Object.keys(EVENT_LABELS) as NotificationEvent[]).map(event => (
            <label
              key={event}
              className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500"
            >
              <input
                type="checkbox"
                checked={enabledEvents.includes(event)}
                onChange={() => toggleEvent(event)}
                disabled={channel === 'none'}
                className="w-4 h-4 text-emerald-600 rounded disabled:opacity-50"
                aria-label={`Notify when ${EVENT_LABELS[event].toLowerCase()}`}
              />
              <span className="text-sm font-medium text-slate-700">
                {EVENT_LABELS[event]}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Messages */}
      {validationError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 font-medium">{validationError}</p>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <Check size={18} className="text-green-600 shrink-0 mt-0.5" />
          <p className="text-sm text-green-700 font-medium">{successMessage}</p>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full px-4 py-2.5 text-sm sm:text-base bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95"
        aria-label={`${isSaving ? 'Saving' : 'Save'} notification preferences for ${member.name}`}
      >
        {isSaving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  );
}
