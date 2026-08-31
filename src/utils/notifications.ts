import { NotificationPreferences, NotificationEvent, NotificationDelivery } from '../types';
import { logError } from './errorLogging';

const NOTIFICATIONS_STORAGE_KEY = 'farm_notifications_deliveries';

export interface NotificationPayload {
  memberId: string;
  eventType: NotificationEvent;
  data: {
    amount?: number;
    category?: string;
    cropName?: string;
    quantity?: number;
    fieldName?: string;
    currency?: string;
  };
}

const MESSAGE_TEMPLATES: Record<NotificationEvent, (data: any) => string> = {
  expense_added: (data) =>
    `New expense: ${data.currency}${Math.round(data.amount)} for ${data.category} (${data.fieldName || 'Common'})`,
  harvest_recorded: (data) =>
    `Harvest recorded: ${data.quantity} units of ${data.cropName} from ${data.fieldName}`,
  settlement_calculated: () =>
    'Settlement calculation completed. Check the app for your statement.',
  labour_logged: (data) =>
    `Labour entry: ${data.quantity} workers recorded for ${data.fieldName}`,
};

export function getMessageTemplate(eventType: NotificationEvent, data: any): string {
  const template = MESSAGE_TEMPLATES[eventType];
  return template ? template(data) : `Farm notification: ${eventType}`;
}

export async function sendNotification(
  prefs: NotificationPreferences,
  payload: NotificationPayload
): Promise<NotificationDelivery> {
  const delivery: NotificationDelivery = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    memberId: prefs.memberId,
    eventType: payload.eventType,
    message: getMessageTemplate(payload.eventType, payload.data),
    channel: prefs.channel,
    sentAt: new Date().toISOString(),
    status: 'pending',
  };

  if (prefs.channel === 'none') {
    delivery.status = 'sent';
  } else if (!prefs.phoneNumber) {
    delivery.status = 'failed';
    delivery.errorMessage = 'Phone number not configured';
  } else {
    try {
      await simulateSendSMS(prefs.phoneNumber, delivery.message, prefs.channel);
      delivery.status = 'sent';
    } catch (err) {
      delivery.status = 'failed';
      delivery.errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logError('notification_send_failed', err, {
        memberId: prefs.memberId,
        channel: prefs.channel,
      });
    }
  }

  saveNotificationDelivery(delivery);
  return delivery;
}

export async function sendBulkNotifications(
  prefs: NotificationPreferences[],
  payload: NotificationPayload
): Promise<NotificationDelivery[]> {
  const deliveries: NotificationDelivery[] = [];

  for (const pref of prefs) {
    if (pref.enabledEvents.includes(payload.eventType)) {
      const delivery = await sendNotification(pref, payload);
      deliveries.push(delivery);
    }
  }

  return deliveries;
}

async function simulateSendSMS(
  phoneNumber: string,
  message: string,
  channel: 'sms' | 'whatsapp'
): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const success = Math.random() > 0.1;
      if (success) {
        console.log(`[${channel.toUpperCase()}] ${phoneNumber}: ${message}`);
        resolve();
      } else {
        reject(new Error(`Failed to send ${channel} to ${phoneNumber}`));
      }
    }, 100);
  });
}

export function saveNotificationDelivery(delivery: NotificationDelivery): void {
  try {
    const existing = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const deliveries: NotificationDelivery[] = existing ? JSON.parse(existing) : [];
    deliveries.push(delivery);
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(deliveries));
  } catch (err) {
    logError('notification_storage_failed', err, {
      deliveryId: delivery.id,
    });
  }
}

export function getNotificationDeliveries(memberId?: string): NotificationDelivery[] {
  try {
    const existing = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const deliveries: NotificationDelivery[] = existing ? JSON.parse(existing) : [];
    return memberId ? deliveries.filter(d => d.memberId === memberId) : deliveries;
  } catch (err) {
    logError('notification_load_failed', err, {});
    return [];
  }
}

export function clearNotificationDeliveries(olderThanDays: number = 30): void {
  try {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const existing = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!existing) return;

    const deliveries: NotificationDelivery[] = JSON.parse(existing);
    const filtered = deliveries.filter(
      d => new Date(d.sentAt).getTime() > cutoffTime
    );
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    logError('notification_cleanup_failed', err, {});
  }
}
