# Backend Real-Time Sync Setup Guide

## Overview

This guide explains how to set up the backend sync infrastructure to prevent data loss in multi-user scenarios. **Without this backend, you risk remote data being overwritten by local data.**

## Architecture

### Three Critical Endpoints

1. **POST `/api/sync/updates`** - Fetch remote changes
   - Client sends: `lastSyncTime`, `clientId`
   - Server returns: All updates since `lastSyncTime`
   - Prevents: Data loss from missing remote changes

2. **POST `/api/sync/push`** - Push local changes to server
   - Client sends: Update with `clientId`, `entityType`, `entityId`, `action`, `data`
   - Server stores in database with timestamp
   - Prevents: Loss of local changes before they're synced

3. **POST `/api/errors`** - Log errors to monitoring
   - Client sends: Error logs with context
   - Server stores for debugging and analytics
   - Prevents: Silent failures

### Data Safety Features

- ✅ **Serial timestamps**: All updates stored with server timestamp for ordering
- ✅ **Client ID tracking**: Each user/device is tracked separately
- ✅ **Conflict detection**: Three-way merge detects simultaneous edits
- ✅ **Offline queueing**: Changes queued and synced when online
- ✅ **Atomic operations**: Database transactions ensure no partial updates

## Setup Instructions

### Step 1: Set Up Firebase Realtime Database

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create or select your project (e.g., "test-48615")
3. Enable Realtime Database:
   - Click "Database" in left sidebar
   - Click "Create Database"
   - Start in **production mode** (add security rules below)
   - Select region (closest to your users)

### Step 2: Create Firebase Service Account

1. Go to Firebase Console > Project Settings > Service Accounts
2. Click "Generate New Private Key"
3. This downloads a JSON file with credentials
4. **Keep this file secure** - treat it like a password

### Step 3: Set Up Database Security Rules

In Firebase Console > Database > Rules, set:

```json
{
  "rules": {
    "sync": {
      "updates": {
        ".indexOn": ["timestamp", "clientId"],
        ".write": "auth != null",
        ".read": "auth != null",
        "$updateId": {
          ".validate": "newData.hasChildren(['clientId', 'timestamp', 'entityType'])"
        }
      },
      "active": {
        ".write": "auth != null",
        ".read": "auth != null"
      },
      "conflicts": {
        ".write": "auth != null",
        ".read": "auth != null"
      }
    },
    "errors": {
      "2024": {
        ".write": "auth != null",
        ".read": "root.child('admins').child(auth.uid).exists()"
      }
    }
  }
}
```

### Step 4: Configure Vercel Environment Variables

On Vercel dashboard:

1. Go to Project Settings > Environment Variables
2. Add:

```
FIREBASE_DATABASE_URL = https://your-project.firebaseio.com
FIREBASE_ADMIN_KEY = (paste entire JSON from Step 2)
```

**Security Note**: Never commit `.env` to git. Only set in Vercel dashboard.

### Step 5: Deploy Backend

```bash
# Install dependencies
npm install

# Build frontend (includes API routes)
npm run build

# Deploy to Vercel
vercel deploy --prod
```

### Step 6: Verify Backend is Working

1. Open app in browser
2. Make a change (e.g., add expense)
3. Check Firebase Console > Database > `sync/updates/` - should see your change
4. Open app in another tab/browser
5. Should see the change reflected in real-time

## Data Safety Guarantees

| Scenario | Without Backend | With Backend |
|----------|-----------------|--------------|
| User A edits, User B edits simultaneously | **Data loss** ❌ Local wins | **Safe merge** ✅ Both changes applied |
| User goes offline, makes changes | Changes lost ❌ | Changes queued ✅ |
| Network fails during upload | Changes discarded ❌ | Retried automatically ✅ |
| Multiple devices, same user | Cross-device conflicts ❌ | Conflict modal ✅ |

## Monitoring & Debugging

### View Sync Logs

Firebase Console > Database:
- Check `sync/updates/` for all changes
- Check `sync/active/` for connected users
- Check `sync/conflicts/` if conflicts occurred

### Check Error Logs

In your app:
- Go to Console > Network tab
- Look for `/api/sync/updates` and `/api/sync/push` requests
- Should return `200` status

Backend logs on Vercel:
1. Go to Vercel Dashboard > Deployments
2. Click latest deployment
3. Go to "Functions" tab
4. See logs for `/api/sync/*` endpoints

### Test Multi-User Sync

1. Open app in Browser A (incognito)
2. Open app in Browser B (different user)
3. Add expense in A - should appear in B in 3 seconds
4. Disconnect A from internet
5. Add expense in A - should queue locally
6. Reconnect A - should sync to B

## Troubleshooting

### "Database unavailable" error
- Check `FIREBASE_DATABASE_URL` in Vercel env vars
- Check Firebase project is active (not deleted)
- Check Firebase Realtime Database is enabled

### "Permission denied" when syncing
- Check security rules above
- Verify Firebase authentication is enabled
- Check service account credentials are valid

### Changes not syncing
- Check browser console for `/api/sync/` requests
- Verify clientId is consistent (not changing)
- Check Firebase for `sync/updates/` entries
- Try hard refresh (Ctrl+Shift+R)

## Performance Notes

- **Polling interval**: 3 seconds (configurable in `realtimeSync.ts`)
- **Database retention**: Updates kept for 30 days (cleanup scheduled)
- **Scalability**: Firebase Realtime DB handles ~1000s of concurrent users

For larger deployments, consider:
- Cloud Firestore (auto-scaling)
- DynamoDB (AWS)
- MongoDB Atlas (if using Node.js backend)

## Cost Estimate (Firebase Realtime DB)

- **Free tier**: 1 GB storage, 100 connections
- **Typical farm app**: ~10 MB/month, 5-50 active users
- **Estimated cost**: $0-5/month for small deployments

## Next Steps

1. ✅ Set up Firebase project
2. ✅ Deploy backend to Vercel
3. ✅ Test multi-user sync
4. ✅ Monitor error logs
5. ⏳ (Optional) Set up alerts for high error rates
6. ⏳ (Optional) Implement Google Sheets sync (currently manual)

## Support

If backend sync fails:
1. Check Vercel deployment logs
2. Verify Firebase credentials
3. Test API endpoints manually:
   ```bash
   curl -X POST https://your-app.vercel.app/api/sync/updates \
     -H "Content-Type: application/json" \
     -d '{"lastSyncTime": 0, "clientId": "test"}'
   ```
4. Check Firebase Console for data

---

**Critical**: Without this backend, the app functions but data loss is possible in multi-user scenarios. This is production-blocking.
