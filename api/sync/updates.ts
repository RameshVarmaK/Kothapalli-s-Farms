import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUpdates } from '../sync-db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lastSyncTime, clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId required' });
    }

    const { updates, remoteUsers } = await getUpdates(lastSyncTime || 0, clientId);

    res.status(200).json({
      updates: updates || [],
      remoteUsers: remoteUsers || {},
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('/api/sync/updates error:', error);
    res.status(500).json({
      error: 'Failed to fetch updates',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
