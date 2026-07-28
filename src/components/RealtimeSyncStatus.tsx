import { useEffect, useState } from 'react';
import { realtimeSync, SyncState } from '../utils/realtimeSync';
import { Wifi, WifiOff, Users } from 'lucide-react';

export function RealtimeSyncStatus() {
  const [syncState, setSyncState] = useState<SyncState>(realtimeSync.getState());

  useEffect(() => {
    // Subscribe to sync state changes
    const unsubscribe = realtimeSync.subscribe((state) => {
      setSyncState(state);
    });

    return unsubscribe;
  }, []);

  const remoteUserCount = syncState.remoteUsers.size;

  return (
    <div className="flex items-center gap-3 text-xs font-semibold">
      {/* Online/Offline Status */}
      <div className="flex items-center gap-1.5">
        {syncState.isOnline ? (
          <>
            <Wifi size={12} className="text-emerald-600" />
            <span className="text-emerald-700">Online</span>
          </>
        ) : (
          <>
            <WifiOff size={12} className="text-amber-600" />
            <span className="text-amber-700">Offline</span>
          </>
        )}
      </div>

      {/* Pending Updates Badge */}
      {syncState.pendingUpdates.length > 0 && (
        <div className="px-2 py-1 bg-amber-100 text-amber-800 rounded-full">
          {syncState.pendingUpdates.length} pending
        </div>
      )}

      {/* Remote Users Indicator */}
      {remoteUserCount > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
          <Users size={12} />
          <span>{remoteUserCount} online</span>
        </div>
      )}

      {/* Last Sync Time */}
      {syncState.lastSyncTime > 0 && (
        <span className="text-slate-500">
          Last sync: {formatTimeAgo(syncState.lastSyncTime)}
        </span>
      )}
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function RemoteUsersList() {
  const [syncState, setSyncState] = useState<SyncState>(realtimeSync.getState());

  useEffect(() => {
    const unsubscribe = realtimeSync.subscribe(setSyncState);
    return unsubscribe;
  }, []);

  if (syncState.remoteUsers.size === 0) return null;

  return (
    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
      <p className="text-xs font-semibold text-blue-900 mb-2">👥 Users Online</p>
      <div className="space-y-1">
        {Array.from(syncState.remoteUsers.entries()).map(([id, user]) => (
          <div key={id} className="flex items-center gap-2 text-xs">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-blue-800">{user.name}</span>
            <span className="text-blue-600 text-[10px]">
              ({formatTimeAgo(user.lastSeen)})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
