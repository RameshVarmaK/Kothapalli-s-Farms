# Real-Time Multi-User Sync Implementation Guide

> **Status: not implemented / not in use.** `realtimeSync.ts` and `RealtimeSyncStatus.tsx` below exist in the codebase but are never imported anywhere. The app's actual multi-user safety net is the Google Sheets sync in `src/utils/googleSheets.ts` (pre-push conflict check + 45s reconciliation poll). This doc is kept for reference only.

## Overview

The real-time sync system enables multiple users to collaborate on the same farm ledger simultaneously with automatic conflict resolution and presence detection.

## Components

### Frontend

**`src/utils/realtimeSync.ts`** - Core sync manager
- Manages online/offline status
- Polls backend for remote updates every 3 seconds
- Applies updates with conflict resolution
- Queues updates when offline

**`src/components/RealtimeSyncStatus.tsx`** - UI components
- Shows online/offline status
- Displays pending updates count
- Lists remote users currently editing
- Shows last sync time

## Backend API Requirements

Implement these endpoints for full real-time sync:

### 1. GET/POST `/api/sync/updates`
**Purpose**: Fetch updates since last sync

**Request**:
```json
{
  "lastSyncTime": 1672531200000,
  "clientId": "1672531200000_abc123"
}
```

**Response**:
```json
{
  "updates": [
    {
      "id": "update_1",
      "timestamp": 1672531205000,
      "userId": "user_1",
      "userName": "Ramesh",
      "entityType": "Expense",
      "entityId": "exp_123",
      "action": "create",
      "data": {
        "id": "exp_123",
        "date": "2024-01-15",
        "amount": 1000,
        "category": "Seeds"
      }
    }
  ],
  "remoteUsers": {
    "user_2": { "name": "Priya", "lastSeen": 1672531210000 },
    "user_3": { "name": "Arjun", "lastSeen": 1672531215000 }
  }
}
```

### 2. POST `/api/sync/push`
**Purpose**: Push local update to backend

**Request**:
```json
{
  "clientId": "1672531200000_abc123",
  "clientName": "Ramesh",
  "entityType": "Expense",
  "entityId": "exp_456",
  "action": "create",
  "data": { /* expense data */ },
  "timestamp": 1672531220000
}
```

**Response**:
```json
{
  "success": true,
  "message": "Update received",
  "serverTimestamp": 1672531220500
}
```

### 3. POST `/api/sync/presence`
**Purpose**: Update user presence/activity (heartbeat)

**Request**:
```json
{
  "clientId": "1672531200000_abc123",
  "clientName": "Ramesh",
  "currentScreen": "money",
  "isActive": true
}
```

## Integration Steps

### Step 1: Add to App.tsx
```typescript
import { realtimeSync } from './utils/realtimeSync';

export default function App() {
  const [db, setDb] = useState<LocalDatabase | null>(null);

  // Start real-time sync when online
  useEffect(() => {
    if (accessToken && db) {
      realtimeSync.startPolling();
      
      return () => realtimeSync.stopPolling();
    }
  }, [accessToken, db]);

  // Subscribe to sync state changes
  useEffect(() => {
    const unsubscribe = realtimeSync.subscribe((state) => {
      // Handle pending updates
      if (state.pendingUpdates.length > 0) {
        const updates = realtimeSync.getPendingUpdates();
        const { db: mergedDb, conflicts } = realtimeSync.applyRemoteUpdates(db, updates);
        
        if (conflicts.length > 0) {
          // Show conflict resolution modal
          setConflictData({ isOpen: true, conflictUpdates: conflicts });
        }
        
        setDb(mergedDb);
        saveDatabase(mergedDb);
      }
    });

    return unsubscribe;
  }, [db]);

  // Add RealtimeSyncStatus to header
  return (
    <div>
      {/* ... existing header ... */}
      <RealtimeSyncStatus />
    </div>
  );
}
```

### Step 2: Push Updates When Editing
```typescript
const handleAddExpense = async (exp: Expense) => {
  // Validate
  const validation = validateExpense(exp);
  if (!validation.valid) {
    // Show error
    return;
  }

  // Add locally
  const nextList = [...expenses, exp];
  const newDb = { ...db, expenses: nextList };
  setDb(newDb);

  // Push to backend for real-time sync
  realtimeSync.pushUpdate('Expense', exp.id, 'create', exp);
};
```

### Step 3: Handle Offline Queue
```typescript
// When coming back online, pending updates are automatically synced
// via the polling mechanism. No additional code needed!
```

## Conflict Resolution Strategy

When two users create/update the same entity:

1. **Create conflicts**: First create wins, second is queued
2. **Update conflicts**: Last write wins (timestamp-based)
3. **Delete conflicts**: Delete is applied after checking for dependencies

## Customization

### Adjust Polling Interval
```typescript
// In realtimeSync.ts, change POLL_INTERVAL
private readonly POLL_INTERVAL = 5000; // 5 seconds instead of 3
```

### Add Custom Entity Types
```typescript
// In applyRemoteUpdates() method, add case for new entity:
case 'YourEntity':
  if (action === 'create') {
    db.yourEntities = [...(db.yourEntities || []), data];
  }
  // ... handle update/delete
  break;
```

### Use WebSocket Instead of Polling
```typescript
// Replace polling with WebSocket for true real-time:
private ws: WebSocket | null = null;

startPolling() {
  this.ws = new WebSocket(`wss://your-server.com/sync`);
  this.ws.onmessage = (event) => {
    const updates = JSON.parse(event.data);
    // Handle updates immediately
  };
}
```

## Monitoring & Debugging

### View Sync State
```typescript
// In browser console
import { realtimeSync } from './utils/realtimeSync';
console.log(realtimeSync.getState());
// Shows: online status, last sync time, pending updates, remote users
```

### View Error Logs
```typescript
import { getErrorLogs } from './utils/errorLogging';
console.log(getErrorLogs());
// Shows all sync-related errors with timestamps
```

## Performance Considerations

- **3-second polling**: Balance between real-time feel and server load
- **Batched updates**: Multiple changes in 3s window sent together
- **Offline first**: All updates work offline, sync when online
- **Lightweight payloads**: Only changed fields sent in updates
- **Browser storage**: Pending updates stored in IndexedDB for reliability

## Security Notes

- Client ID is stable per device/browser
- Implement server-side authentication for `/api/sync/*` endpoints
- Validate all incoming data server-side
- Log all sync operations for audit trail
- Rate-limit updates per user (e.g., 100/minute)
- Encrypt sensitive data in transit (HTTPS required)

## Testing

```typescript
// Mock real-time sync in tests
vi.mock('./utils/realtimeSync', () => ({
  realtimeSync: {
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    pushUpdate: vi.fn(),
    subscribe: vi.fn(),
    getState: () => ({
      isOnline: true,
      pendingUpdates: [],
      remoteUsers: new Map()
    })
  }
}));
```

## Roadmap

**Phase 1 (Current)**: Polling-based sync with basic conflict resolution
- ✅ Online/offline detection
- ✅ Periodic polling (3 seconds)
- ✅ Conflict detection
- ✅ Offline queueing
- ✅ Presence detection

**Phase 2 (Future)**: Enhanced real-time
- WebSocket for true real-time
- Operational transformation for rich text fields
- Granular field-level conflicts
- Real-time notifications

**Phase 3 (Future)**: Advanced collaboration
- Cursor positions (who's editing what)
- Comments and discussions
- Activity timeline
- Change history with diffs
