import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const getFirebaseConfig = () => {
  const custom = localStorage.getItem('farmledger_custom_firebase_config');
  if (custom) {
    try {
      const parsed = JSON.parse(custom);
      if (parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse custom firebase config:', e);
    }
  }
  return firebaseConfig;
};

const app = getApps().length === 0 ? initializeApp(getFirebaseConfig()) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request the Sheets and Drive scopes we configured earlier
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let storedToken = null;
try {
  storedToken = localStorage.getItem('farmledger_google_access_token');
} catch (e) {
  console.error('Failed to get stored access token:', e);
}
let cachedAccessToken: string | null = storedToken;

export const handleRedirectResult = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
        try {
          localStorage.setItem('farmledger_google_access_token', cachedAccessToken);
        } catch (e) {
          console.error('Failed to preserve access token in storage:', e);
        }
        return { user: result.user, accessToken: cachedAccessToken };
      }
    }
  } catch (error: any) {
    console.error('Redirect result fetch error:', error);
    throw error;
  }
  return null;
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  // First, check if we have a residual redirect result on load
  handleRedirectResult().then((result) => {
    if (result && onAuthSuccess) {
      onAuthSuccess(result.user, result.accessToken);
    }
  }).catch((err) => {
    console.error('Initial redirect check error:', err);
  });

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // If we have a user but no cached token, they need to sign in again to obtain a token
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      try {
        localStorage.removeItem('farmledger_google_access_token');
      } catch (e) {}
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google Sign-In');
    }

    cachedAccessToken = credential.accessToken;
    try {
      localStorage.setItem('farmledger_google_access_token', cachedAccessToken);
    } catch (e) {
      console.error('Failed to preserve access token in storage:', e);
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const googleSignInRedirect = async (): Promise<void> => {
  try {
    isSigningIn = true;
    await signInWithRedirect(auth, provider);
  } catch (error: any) {
    console.error('Sign in redirect error:', error);
    isSigningIn = false;
    throw error;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  try {
    localStorage.removeItem('farmledger_google_access_token');
  } catch (e) {}
};
