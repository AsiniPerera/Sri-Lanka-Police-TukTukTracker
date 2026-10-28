import { useState } from 'react';
import { useLiveStats, useLiveVehicles, type LiveFilters } from '../api/hooks';
import StatsBar from './StatsBar';
import TrackerMap from './TrackerMap';
import VehicleList from './VehicleList';

export default function LiveDashboard() {
  const [filters, setFilters] = useState<LiveFilters>({ online: '' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, error, loading, total, lastUpdated } = useLiveVehicles(filters);
  const stats = useLiveStats();
  const vehicles = data ?? [];

  return (
    <section className="dash">
      <StatsBar stats={stats} />

      {error && (
        <div className="alert alert--warn" role="status">
          <strong>{(error as { code?: string }).code ?? 'ERROR'}</strong>{' '}
          {error.message} — showing last known positions.
        </div>
      )}

      <div className="dash__body">
        <aside className="sidebar">
          <div className="sidebar__head">
            <h2 className="sidebar__title">
              Live units <span className="sidebar__count">{total}</span>
            </h2>
            {lastUpdated && (
              <span className="sidebar__sync">
                synced {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="sidebar__filters">
            <input
              type="search"
              className="input input--sm"
              placeholder="Filter by plate…"
              value={filters.license_plate ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, license_plate: e.target.value }))
              }
              aria-label="Filter by license plate"
            />
            <select
              className="input input--sm"
              value={filters.online ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  online: e.target.value as LiveFilters['online'],
                }))
              }
              aria-label="Filter by connectivity"
            >
              <option value="">All units</option>
              <option value="true">Online only</option>
              <option value="false">Offline only</option>
            </select>
          </div>

          <VehicleList
            vehicles={vehicles}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
          />
        </aside>

        <TrackerMap
          vehicles={vehicles}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
    </section>
  );
}
