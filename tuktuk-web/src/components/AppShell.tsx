import LogoutButton from './LogoutButton';
import { useState } from 'react';
import { useMe } from '../api/hooks';
import { ROLES } from '../api/types';
import LiveDashboard from './LiveDashboard';
import VehiclesPage from './VehiclesPage';

type Tab = 'live' | 'vehicles';

const ROLE_LABELS: Record<string, string> = {
  [ROLES.ADMIN_HQ]: 'HQ Administrator',
  [ROLES.PROVINCIAL_OFFICER]: 'Provincial Officer',
  [ROLES.DISTRICT_OFFICER]: 'District Officer',
  [ROLES.STATION_OFFICER]: 'Station Officer',
};

export default function AppShell() {
  const [tab, setTab] = useState<Tab>('live');
  const { data: me, error, loading } = useMe();

  if (loading) {
    return (
      <div className="centered">
        <p>Loading your officer profile…</p>
      </div>
    );
  }

  // Authenticated by Asgardeo, but asgardeoAuth.js found no matching User record.
  // This is the deliberate behaviour: auto-creating the account would leave
  // scope_id null, which resolveScope() silently turns into "sees nothing".
  if (error && 'isNotProvisioned' in error && error.isNotProvisioned) {
    return (
      <div className="centered">
        <div className="notice">
          <h2>Account not provisioned</h2>
          <p>
            Your Asgardeo sign-in succeeded, but no officer record exists in
            TukTukTracker yet. Ask HQ to create your account and link it to your
            station, district or province.
          </p>
          <LogoutButton />
        </div>
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="centered">
        <div className="notice notice--error">
          <h2>Could not load your profile</h2>
          <p>{error?.message ?? 'Unknown error'}</p>
          <p className="notice__hint">
            Check that the API is running on{' '}
            <code>{import.meta.env.VITE_API_BASE_URL}</code> and that its{' '}
            <code>CORS_ORIGINS</code> includes <code>{window.location.origin}</code>.
          </p>
          <LogoutButton />
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo" aria-hidden="true">
            🚖
          </span>
          <span className="topbar__name">TukTuk Tracker</span>
        </div>

        <nav className="tabs" aria-label="Sections">
          <button
            type="button"
            className={`tab${tab === 'live' ? ' tab--active' : ''}`}
            aria-current={tab === 'live' ? 'page' : undefined}
            onClick={() => setTab('live')}
          >
            Live map
          </button>
          <button
            type="button"
            className={`tab${tab === 'vehicles' ? ' tab--active' : ''}`}
            aria-current={tab === 'vehicles' ? 'page' : undefined}
            onClick={() => setTab('vehicles')}
          >
            Vehicles
          </button>
        </nav>

        <div className="topbar__user">
          <div className="who">
            <span className="who__name">{me.full_name || me.username}</span>
            <span className="who__role">{ROLE_LABELS[me.role] ?? me.role}</span>
          </div>
          <LogoutButton className="btn btn--ghost" />
        </div>
      </header>

      <main className="main">
        {tab === 'live' ? <LiveDashboard /> : <VehiclesPage role={me.role} />}
      </main>
    </div>
  );
}
