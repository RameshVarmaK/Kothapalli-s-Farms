import { LocalDatabase } from './database';
import { logError, logWarning } from './errorLogging';

export interface RemoteUpdate {
  id: string;
  timestamp: number;
  userId: string;
  userName: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  data: any;
}

export interface SyncState {
  isOnline: boolean;
  lastSyncTime: number;
  pendingUpdates: RemoteUpdate[];
  remoteUsers: Map<string, { name: string; lastSeen: number }>;
}

class RealtimeSyncManager {
  private syncState: SyncState = {
    isOnline: navigator.onLine,
    lastSyncTime: Date.now(),
    pendingUpdates: [],
    remoteUsers: new Map()
  };

  private pollIntervalId: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 3000; // 3 seconds for polling updates
  private listeners: ((state: SyncState) => void)[] = [];

  constructor() {
    // Monitor online/offline status
    window.addEventListener('online', () => this.setOnlineStatus(true));
    window.addEventListener('offline', () => this.setOnlineStatus(false));
  }

  private setOnlineStatus(online: boolean) {
    this.syncState.isOnline = online;
    if (online) {
      logWarning('sync_status', 'Back online, resuming sync');
      this.startPolling();
    } else {
      logWarning('sync_status', 'Offline, pausing real-time sync');
      this.stopPolling();
    }
    this.notifyListeners();
  }

  /**
   * Start polling for remote updates (simple real-time sync)
   * For production, replace with WebSocket or Server-Sent Events
   */
  startPolling() {
    if (this.pollIntervalId) return;

    this.pollIntervalId = setInterval(() => {
      this.fetchRemoteUpdates();
    }, this.POLL_INTERVAL);
  }

  stopPolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  /**
   * Fetch updates from backend (endpoint: /api/sync/updates)
   * Returns updates since lastSyncTime
   */
  private async fetchRemoteUpdates() {
    if (!this.syncState.isOnline) return;

    try {
      const response = await fetch('/api/sync/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastSyncTime: this.syncState.lastSyncTime,
          clientId: this.getClientId()
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          logWarning('sync_auth', 'Sync session expired');
          return;
        }
        throw new Error(`Sync failed: ${response.statusText}`);
      }

      const { updates, remoteUsers } = await response.json();

      if (updates && updates.length > 0) {
        this.syncState.pendingUpdates.push(...updates);
        this.syncState.lastSyncTime = Math.max(
          ...updates.map((u: RemoteUpdate) => u.timestamp)
        );
      }

      if (remoteUsers) {
        this.syncState.remoteUsers = new Map(
          Object.entries(remoteUsers).map(([id, user]: [string, any]) => [id, user])
        );
      }

      this.notifyListeners();
    } catch (err) {
      logError('realtime_sync_error', err, { endpoint: '/api/sync/updates' });
    }
  }

  /**
   * Push local update to backend (endpoint: /api/sync/push)
   * Called when user makes a change
   */
  async pushUpdate(
    entityType: string,
    entityId: string,
    action: 'create' | 'update' | 'delete',
    data: any
  ): Promise<boolean> {
    if (!this.syncState.isOnline) {
      // Queue for later
      const update: RemoteUpdate = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        userId: this.getClientId(),
        userName: this.getClientName(),
        entityType,
        entityId,
        action,
        data
      };
      this.syncState.pendingUpdates.push(update);
      return false;
    }

    try {
      const response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.getClientId(),
          clientName: this.getClientName(),
          entityType,
          entityId,
          action,
          data,
          timestamp: Date.now()
        })
      });

      if (!response.ok) {
        throw new Error(`Push failed: ${response.statusText}`);
      }

      return true;
    } catch (err) {
      logError('sync_push_failed', err, { entityType, entityId, action });
      return false;
    }
  }

  /**
   * Get all pending updates and clear the queue
   */
  getPendingUpdates(): RemoteUpdate[] {
    const updates = [...this.syncState.pendingUpdates];
    this.syncState.pendingUpdates = [];
    return updates;
  }

  /**
   * Apply remote updates to local database
   * Handles three-way merge for conflicts
   */
  applyRemoteUpdates(
    localDb: LocalDatabase,
    remoteUpdates: RemoteUpdate[]
  ): { db: LocalDatabase; conflicts: RemoteUpdate[] } {
    const conflicts: RemoteUpdate[] = [];
    let db = { ...localDb };

    for (const update of remoteUpdates) {
      const { entityType, action, data, userId } = update;

      switch (entityType) {
        case 'Expense':
          if (action === 'create') {
            const existingExpense = db.expenses?.find(e => e.id === data.id);
            if (existingExpense) {
              // Conflict: both created same expense - keep local version
              conflicts.push(update);
            } else {
              db.expenses = [...(db.expenses || []), data];
            }
          } else if (action === 'update') {
            db.expenses = (db.expenses || []).map(e =>
              e.id === data.id ? { ...e, ...data } : e
            );
          } else if (action === 'delete') {
            db.expenses = (db.expenses || []).filter(e => e.id !== data.id);
          }
          break;

        case 'Labour':
          if (action === 'create') {
            const existingLabour = db.labours?.find(l => l.id === data.id);
            if (existingLabour) {
              conflicts.push(update);
            } else {
              db.labours = [...(db.labours || []), data];
            }
          } else if (action === 'update') {
            db.labours = (db.labours || []).map(l =>
              l.id === data.id ? { ...l, ...data } : l
            );
          } else if (action === 'delete') {
            db.labours = (db.labours || []).filter(l => l.id !== data.id);
          }
          break;

        case 'HarvestRevenue':
          if (action === 'create') {
            const existingRevenue = db.revenues?.find(r => r.id === data.id);
            if (existingRevenue) {
              conflicts.push(update);
            } else {
              db.revenues = [...(db.revenues || []), data];
            }
          } else if (action === 'update') {
            db.revenues = (db.revenues || []).map(r =>
              r.id === data.id ? { ...r, ...data } : r
            );
          } else if (action === 'delete') {
            db.revenues = (db.revenues || []).filter(r => r.id !== data.id);
          }
          break;

        case 'Member':
          if (action === 'create') {
            const existingMember = db.members?.find(m => m.id === data.id);
            if (existingMember) {
              conflicts.push(update);
            } else {
              db.members = [...(db.members || []), data];
            }
          } else if (action === 'update') {
            db.members = (db.members || []).map(m =>
              m.id === data.id ? { ...m, ...data } : m
            );
          } else if (action === 'delete') {
            db.members = (db.members || []).filter(m => m.id !== data.id);
          }
          break;

        case 'Field':
          if (action === 'create') {
            const existingField = db.fields?.find(f => f.id === data.id);
            if (existingField) {
              conflicts.push(update);
            } else {
              db.fields = [...(db.fields || []), data];
            }
          } else if (action === 'update') {
            db.fields = (db.fields || []).map(f =>
              f.id === data.id ? { ...f, ...data } : f
            );
          } else if (action === 'delete') {
            db.fields = (db.fields || []).filter(f => f.id !== data.id);
          }
          break;

        // Add more entity types as needed
      }
    }

    return { db, conflicts };
  }

  /**
   * Get current sync state (online status, pending updates, active users)
   */
  getState(): SyncState {
    return { ...this.syncState };
  }

  /**
   * Subscribe to sync state changes
   */
  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getState()));
  }

  /**
   * Get a stable client ID for this device
   */
  private getClientId(): string {
    const key = 'farm_ledger_client_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      try {
        localStorage.setItem(key, id);
      } catch (e) {
        // localStorage may be unavailable
      }
    }
    return id;
  }

  /**
   * Get client name from local storage or user profile
   */
  private getClientName(): string {
    try {
      const stored = localStorage.getItem('farm_ledger_client_name');
      return stored || 'Anonymous Farmer';
    } catch {
      return 'Anonymous Farmer';
    }
  }

  /**
   * Set client name for identification in real-time sync
   */
  setClientName(name: string) {
    try {
      localStorage.setItem('farm_ledger_client_name', name);
    } catch (e) {
      logWarning('storage_failed', 'Could not save client name');
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopPolling();
    window.removeEventListener('online', () => this.setOnlineStatus(true));
    window.removeEventListener('offline', () => this.setOnlineStatus(false));
  }
}

// Export singleton instance
export const realtimeSync = new RealtimeSyncManager();
