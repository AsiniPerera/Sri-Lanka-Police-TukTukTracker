import type { LiveVehicle } from '../api/types';

interface Props {
  vehicles: LiveVehicle[];
  selectedId: string | null;
  onSelect: (vehicleId: string | null) => void;
  loading: boolean;
}

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function VehicleList({ vehicles, selectedId, onSelect, loading }: Props) {
  if (loading && vehicles.length === 0) {
    return <p className="sidebar__empty">Loading live positions…</p>;
  }

  if (vehicles.length === 0) {
    return (
      <div className="sidebar__empty">
        <p>No vehicles are reporting in your area of responsibility.</p>
        <p className="sidebar__hint">
          If you expected results, your officer record may have no{' '}
          <code>scope_id</code> set — ask HQ to check.
        </p>
      </div>
    );
  }

  // Online first, then most recently heard from.
  const ordered = [...vehicles].sort((a, b) => {
    if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
    return new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime();
  });

  return (
    <ul className="vlist">
      {ordered.map((v) => (
        <li key={v.vehicle_id}>
          <button
            type="button"
            className={`vlist__item${
              selectedId === v.vehicle_id ? ' vlist__item--active' : ''
            }`}
            onClick={() =>
              onSelect(selectedId === v.vehicle_id ? null : v.vehicle_id)
            }
          >
            <span
              className={`vlist__dot vlist__dot--${
                v.vehicle_status === 'WANTED'
                  ? 'wanted'
                  : v.vehicle_status === 'SUSPENDED'
                    ? 'suspended'
                    : v.is_online
                      ? 'online'
                      : 'offline'
              }`}
              aria-hidden="true"
            />
            <span className="vlist__plate">{v.license_plate ?? '—'}</span>
            <span className="vlist__speed">{Math.round(v.speed)} km/h</span>
            <span className="vlist__time">{relativeTime(v.last_updated)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
