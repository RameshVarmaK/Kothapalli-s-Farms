/**
 * Sending a partner their statement over WhatsApp with no server: a wa.me
 * link opens WhatsApp with the message filled in, and the owner taps Send.
 */
import { PartnerLedger } from './partnerLedger';
import { formatMoney, formatSignedMoney } from './format';

/** The number wa.me wants: digits with the country code, no plus. Indian
 * ten-digit numbers get 91. Null when the phone cannot be read as one. */
export function whatsappNumber(phone: string | undefined | null): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export function whatsappShareUrl(text: string, phone?: string | null): string {
  const number = whatsappNumber(phone);
  return `https://wa.me/${number || ''}?text=${encodeURIComponent(text)}`;
}

export interface StatementInput {
  ledger: PartnerLedger;
  /** What the statement covers, e.g. "All crop cycles" or "Paddy · North Plot". */
  scopeLabel: string;
  currency: string;
  /** Where to open the ledger; left out when unknown. */
  appUrl?: string;
  /** Translator; the message is written in the app's current language. */
  t: (text: string) => string;
  today?: Date;
}

/** The statement as WhatsApp text: headline figures and any pending transfers. */
export function partnerStatementText({ ledger, scopeLabel, currency, appUrl, t, today = new Date() }: StatementInput): string {
  const money = (v: number) => formatMoney(v, currency);
  const date = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const net = ledger.totals.netPosition;
  const advances = ledger.advances.total > 0.5 ? ledger.advances.total : 0;

  const lines: string[] = [
    `*${t("Kothapalli's Farms")}* – ${t('statement for')} ${ledger.memberName}`,
    `${t('Covers')}: ${scopeLabel} · ${date}`,
    '',
    `${t('Paid in')}: ${money(ledger.totals.paidIn + advances)}`,
    `${t('Share of cost')}: ${money(ledger.totals.costShare)}`,
    `${t('Revenue taken')}: ${money(ledger.totals.received)}`,
    `${t('Share of revenue')}: ${money(ledger.totals.revenueShare)}`,
    `*${t('Net Standing')}: ${formatSignedMoney(net, currency)}* (${net >= 0 ? t('you receive') : t('you pay')})`,
  ];

  const pending = ledger.cycles.flatMap(c => c.settlements.filter(s => !s.cleared).map(s => ({ ...s, cycle: `${c.cropName} · ${c.fieldName}` })));
  if (pending.length > 0) {
    lines.push('', `${t('Pending transfers')}:`);
    pending.forEach(s => {
      lines.push(
        s.direction === 'pays'
          ? `• ${t('Pay')} ${money(s.amount)} ${t('to')} ${s.counterpartyName} (${s.cycle})`
          : `• ${t('Receive')} ${money(s.amount)} ${t('from')} ${s.counterpartyName} (${s.cycle})`
      );
    });
  } else {
    lines.push('', t('No transfers pending.'));
  }

  if (appUrl) lines.push('', `${t('Open the ledger')}: ${appUrl}`);
  return lines.join('\n');
}
