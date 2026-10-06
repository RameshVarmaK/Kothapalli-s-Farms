/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, googleSignInRedirect, logout } from '../utils/auth';
import {
  getInitialDatabase,
  LocalDatabase,
  safeStorageRemove,
  LEGACY_CLEARANCE_KEYS
} from '../utils/database';

export interface AuthError {
  code: string;
  message: string;
  domain: string;
}

/**
 * Google sign-in for the app shell: who is signed in, their Sheets/Drive
 * access token, and why the last sign-in failed. Also bootstraps the local
 * database on mount, in the same effect that starts the auth listener, and
 * clears it when the Google account changes or signs out.
 */
export function useGoogleAuth(setDb: Dispatch<SetStateAction<LocalDatabase | null>>) {
  // Unified Google Firebase Authentication state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  // Why the sign-in screen is showing after a failed pull ("session-expired"
  // or the error text). Set by the login auto-fetch, cleared on sign-in.
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    // Synchronous bootstrap local database
    const loadedDb = getInitialDatabase();
    setDb(loadedDb);

    // Bootstrap continuous Firebase auth flow state listener
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(prevUser => {
          if (prevUser && prevUser.uid !== currentUser.uid) {
            console.log("Detected Google profile switch. Purging old database local cache...");
            safeStorageRemove('farm_ledger_database');
            LEGACY_CLEARANCE_KEYS.forEach(safeStorageRemove);
            setDb(getInitialDatabase());
          }
          return currentUser;
        });
        setAccessToken(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleLogin = async (mode: 'popup' | 'redirect' = 'popup'): Promise<string | null> => {
    try {
      setAuthError(null);
      setFetchError(null);
      if (mode === 'redirect') {
        await googleSignInRedirect();
        return null; // Will trigger redirect, so page will unload
      }
      const result = await googleSignIn();
      if (result) {
        if (user && user.uid !== result.user.uid) {
          console.log("Logged in different user. Cleaning stale local state cache...");
          safeStorageRemove('farm_ledger_database');
          setDb(getInitialDatabase());
        }
        setUser(result.user);
        setAccessToken(result.accessToken);
        return result.accessToken;
      }
    } catch (error: any) {
      console.error('Unified Google Auth Login error:', error);
      setAuthError({
        code: error?.code || 'auth/unknown',
        message: error?.message || String(error),
        domain: window.location.origin
      });
    }
    return null;
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      console.log("Logged out active slot. Removing local storage cache cleanly...");
      safeStorageRemove('farm_ledger_database');
      setDb(getInitialDatabase());
    } catch (error) {
      console.error('Unified Google Auth Disconnect error:', error);
    }
  };

  return {
    user,
    accessToken,
    setAccessToken,
    authError,
    setAuthError,
    fetchError,
    setFetchError,
    handleLogin,
    handleLogout
  };
}
