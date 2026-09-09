import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase } from 'firebase-admin/database';
import { initializeApp, cert } from 'firebase-admin/app';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      code,
      message,
      details,
      timestamp,
      clientId,
      clientName,
      userAgent,
      url
    } = req.body;

    if (!code || !message) {
      return res.status(400).json({
        error: 'Missing required fields: code, message'
      });
    }

    const errorRecord = {
      code,
      message,
      details: details || {},
      timestamp: timestamp || Date.now(),
      clientId: clientId || 'unknown',
      clientName: clientName || 'Anonymous',
      userAgent: userAgent || '',
      url: url || '',
      serverTimestamp: Date.now(),
      environment: process.env.NODE_ENV || 'development'
    };

    // Store in Firebase for monitoring
    const database = getDb();
    if (database) {
      const errorId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const errorRef = database.ref(`errors/${Date.now().toString().slice(0, 8)}/${errorId}`);
      await errorRef.set(errorRecord);
    }

    // Also log to console for real-time debugging
    console.error('[ERROR LOG]', {
      code,
      message,
      clientId,
      timestamp: new Date(errorRecord.timestamp).toISOString()
    });

    res.status(200).json({
      success: true,
      errorId: errorRecord.timestamp
    });
  } catch (error) {
    console.error('/api/errors handler error:', error);
    // Still return 200 to avoid client-side error loops
    res.status(200).json({
      success: false,
      message: 'Error logged on server'
    });
  }
}
