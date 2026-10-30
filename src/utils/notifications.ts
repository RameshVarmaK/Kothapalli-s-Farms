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
    description?: string;
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
    `Labour entry: ${data.quantity} workers recorded for ${data.fieldName}${data.description ? ` (${data.description})` : ''}`,
};

export function getMessageTemplate(eventType: NotificationEvent, data: any): string {
  const template = MESSAGE_TEMPLATES[eventType];
  return template ? template(data) : `Farm notification: ${eventType}`;
}

/**
 * Where SMS/WhatsApp messages are handed off. The app is a static site with
 * no server, so delivery needs a relay: set VITE_NOTIFY_WEBHOOK_URL at build
 * time to an endpoint (a Vercel function, Twilio/Gupshup bridge, n8n flow…)
 * that accepts POST {phoneNumber, channel, message, eventType, memberId}.
 *
 * Without it nothing is sent, and the delivery log says so. The previous
 * "sender" was a timer that reported success at random and only wrote to the
 * browser console; partners who switched notifications on were never told
 * that no message would reach their phone.
 */
export const NOTIFY_WEBHOOK_URL: string = (import.meta.env?.VITE_NOTIFY_WEBHOOK_URL as string | undefined)?.trim() || '';

export const NOT_CONNECTED_MESSAGE = 'Messaging is not connected on this deployment, so no SMS/WhatsApp was sent.';

export function isNotificationDeliveryConfigured(): boolean {
  return NOTIFY_WEBHOOK_URL.length > 0;
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
  } else if (!isNotificationDeliveryConfigured()) {
    delivery.status = 'failed';
    delivery.errorMessage = NOT_CONNECTED_MESSAGE;
  } else {
    try {
      await postToWebhook(prefs.phoneNumber, delivery, payload);
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

async function postToWebhook(
  phoneNumber: string,
  delivery: NotificationDelivery,
  payload: NotificationPayload
): Promise<void> {
  const response = await fetch(NOTIFY_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phoneNumber,
      channel: delivery.channel,
      message: delivery.message,
      eventType: payload.eventType,
      memberId: payload.memberId,
    }),
  });
  if (!response.ok) {
    throw new Error(`Messaging relay rejected the request: ${response.status} ${response.statusText || ''}`.trim());
  }
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
