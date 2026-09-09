import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pushUpdate } from '../sync-db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      clientId,
      clientName,
      entityType,
      entityId,
      action,
      data,
      timestamp,
      id
    } = req.body;

    // Validate required fields
    if (!clientId || !entityType || !entityId || !action) {
      return res.status(400).json({
        error: 'Missing required fields: clientId, entityType, entityId, action'
      });
    }

    if (!['create', 'update', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const update = {
      id: id || `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      clientId,
      clientName: clientName || 'Anonymous Farmer',
      entityType,
      entityId,
      action,
      data: data || {},
      timestamp: timestamp || Date.now()
    };

    const result = await pushUpdate(update);

    if (!result.success) {
      return res.status(500).json({
        error: result.error || 'Failed to push update'
      });
    }

    res.status(200).json({
      success: true,
      updateId: update.id,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('/api/sync/push error:', error);
    res.status(500).json({
      error: 'Failed to process update',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
