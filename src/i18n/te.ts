import { teShell } from './te.shell';
import { teMoney } from './te.money';
import { teDashboard } from './te.dashboard';
import { teCredits } from './te.credits';
import { teMembers } from './te.members';
import { teStock } from './te.stock';
import { teSettings } from './te.settings';
import { teNotifications } from './te.notifications';

// Flat English-text-as-key -> Telugu dictionary, assembled from per-area
// files so independent areas can be extended without touching each other.
export const te: Record<string, string> = {
  ...teShell,
  ...teMoney,
  ...teDashboard,
  ...teCredits,
  ...teMembers,
  ...teStock,
  ...teSettings,
  ...teNotifications,
};
