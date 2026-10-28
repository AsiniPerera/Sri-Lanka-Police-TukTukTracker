import { useAsgardeo } from '@asgardeo/react';
import { useEffect, useState } from 'react';
import AppShell from './components/AppShell';
import LoginScreen from './components/LoginScreen';
import { isAsgardeoConfigured } from './auth/config';
import { useLegacyToken } from './auth/legacySession';

/** How long to wait for the SDK before showing the login screen anyway. */
const INIT_TIMEOUT_MS = 4000;

/**
 * Reads an OAuth error that Asgardeo appended to the redirect, from either the
 * query string or the fragment. Without this the SDK swallows the failure and
 * the user just sees a login page again with no explanation.
 */
function readOAuthError(): string | null {
  const sources = [
    new URLSearchParams(window.location.search),
    new URLSearchParams(window.location.hash.replace(/^#/, '')),
  ];
  for (const params of sources) {
    const error = params.get('error');
    if (error) {
      const description = params.get('error_description');
      return description ? `${error}: ${description}` : error;
    }
  }
  return null;
}

export default function App() {
  const legacyToken = useLegacyToken();
  const { isSignedIn, isLoading } = useAsgardeo();

  const [oauthError] = useState(readOAuthError);
  const [initTimedOut, setInitTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setInitTimedOut(true), INIT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // A dev password session bypasses the Asgardeo state machine entirely.
  if (legacyToken) {
    return <AppShell />;
  }

  if (!isAsgardeoConfigured) {
    return (
      <div className="centered">
        <div className="notice notice--error">
          <h2>Asgardeo is not configured</h2>
          <p>
            Copy <code>.env.example</code> to <code>.env.local</code> and fill in{' '}
            <code>VITE_ASGARDEO_CLIENT_ID</code> and{' '}
            <code>VITE_ASGARDEO_BASE_URL</code>, then restart the dev server.
          </p>
          <p className="notice__hint">
            Vite only reads env files at startup — editing one while{' '}
            <code>npm run dev</code> is running has no effect.
          </p>
        </div>
      </div>
    );
  }

  if (isSignedIn) {
    return <AppShell />;
  }

  // Only block on the SDK briefly. If it never settles, fall through to the
  // login screen so the password fallback stays reachable.
  if (isLoading && !initTimedOut && !oauthError) {
    return (
      <div className="centered">
        <p>Checking your session…</p>
      </div>
    );
  }

  return <LoginScreen oauthError={oauthError} stalled={isLoading && initTimedOut} />;
}
