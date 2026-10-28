import { useState } from 'react';
import { legacyLogin } from '../auth/legacySession';

/**
 * Dev-only password form hitting the API's POST /auth/login.
 *
 * Kept visually subordinate to the Asgardeo button on purpose: Asgardeo is the
 * intended path, this is the migration fallback. Remove along with
 * src/auth/legacySession.ts once Asgardeo sign-in works.
 */
export default function LegacyLoginForm() {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await legacyLogin(username, password);
    // On success the session store re-renders the tree, unmounting this form.
    if (!result.ok) {
      setError(result.message ?? 'Login failed');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="login__toggle" onClick={() => setOpen(true)}>
        Use password login (dev)
      </button>
    );
  }

  return (
    <form className="legacy" onSubmit={onSubmit}>
      <label className="legacy__label" htmlFor="legacy-username">
        Username
      </label>
      <input
        id="legacy-username"
        className="input"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={busy}
      />

      <label className="legacy__label" htmlFor="legacy-password">
        Password
      </label>
      <input
        id="legacy-password"
        className="input"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy}
      />

      {error && (
        <p className="legacy__error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn--block" disabled={busy || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="legacy__hint">
        Seeded accounts: <code>admin / Admin@1234</code>,{' '}
        <code>prov_western / Officer@123</code>,{' '}
        <code>dist_colombo / Officer@123</code>
      </p>
    </form>
  );
}
