import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

let db: any = null;

function getDb() {
  if (db) return db;

  try {
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY || '{}')),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    db = getDatabase();
  } catch (error) {
    console.error('Firebase init failed:', error);
  }

  return db;
}

export interface SyncUpdate {
  id: string;
  clientId: string;
  clientName: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
}

export async function getUpdates(lastSyncTime: number, clientId: string) {
  const db = getDb();
  if (!db) return { updates: [], remoteUsers: {} };

  try {
    const updatesRef = db.ref('sync/updates');
    const snapshot = await updatesRef
      .orderByChild('timestamp')
      .startAt(lastSyncTime + 1)
      .once('value');

    const updates: SyncUpdate[] = [];
    const remoteUsers: Record<string, any> = {};

    snapshot.forEach((child: any) => {
      const update = child.val();
      if (update.clientId !== clientId) {
        updates.push(update);
        remoteUsers[update.clientId] = {
          name: update.clientName,
          lastSeen: update.timestamp
        };
      }
    });

    return { updates, remoteUsers };
  } catch (error) {
    console.error('getUpdates failed:', error);
    return { updates: [], remoteUsers: {} };
  }
}

export async function pushUpdate(update: SyncUpdate) {
  const db = getDb();
  if (!db) return { success: false, error: 'Database unavailable' };

  try {
    const updateId = update.id;
    const updateRef = db.ref(`sync/updates/${updateId}`);
    await updateRef.set({
      ...update,
      serverTimestamp: Date.now()
    });

    // Update last active user
    await db.ref(`sync/active/${update.clientId}`).set({
      name: update.clientName,
      lastSeen: Date.now()
    });

    return { success: true };
  } catch (error) {
    console.error('pushUpdate failed:', error);
    return { success: false, error: String(error) };
  }
}

export async function handleConflict(
  clientId: string,
  entityType: string,
  entityId: string,
  localData: any,
  remoteData: any
) {
  const db = getDb();
  if (!db) return null;

  try {
    const conflictId = `${entityType}:${entityId}:${Date.now()}`;
    const conflictRef = db.ref(`sync/conflicts/${conflictId}`);
    await conflictRef.set({
      clientId,
      entityType,
      entityId,
      localData,
      remoteData,
      timestamp: Date.now(),
      resolved: false
    });

    return conflictId;
  } catch (error) {
    console.error('handleConflict failed:', error);
    return null;
  }
}

export async function cleanupOldUpdates(retentionDays = 30) {
  const db = getDb();
  if (!db) return;

  try {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const updatesRef = db.ref('sync/updates');
    const snapshot = await updatesRef
      .orderByChild('timestamp')
      .endAt(cutoffTime)
      .once('value');

    snapshot.forEach((child: any) => {
      child.ref.remove();
    });
  } catch (error) {
    console.error('cleanupOldUpdates failed:', error);
  }
}
