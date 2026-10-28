import { useVehicles } from '../api/hooks';
import { ROLES, type Role } from '../api/types';

interface Props {
  role: Role;
}

/**
 * The vehicle registry (GET /vehicles).
 *
 * Results are already scoped server-side by applyVehicleScope() in
 * src/middleware/rbac.js, so a district officer simply receives fewer rows.
 * The frontend does no filtering of its own — that would be security theatre,
 * since anyone can call the API directly.
 *
 * Role checks here only hide controls that would 403 anyway. The real
 * enforcement is authorize(...) on the Express routes.
 */
export default function VehiclesPage({ role }: Props) {
  const { vehicles, loading, error, page, pages, total, search, setSearch, setPage } =
    useVehicles();

  const canEdit = role === ROLES.ADMIN_HQ || role === ROLES.PROVINCIAL_OFFICER;

  return (
    <section className="page">
      <header className="page__head">
        <div>
          <h2 className="page__title">Vehicle registry</h2>
          <p className="page__meta">
            {total.toLocaleString()} vehicle{total === 1 ? '' : 's'} in your scope
          </p>
        </div>

        <div className="page__actions">
          <input
            type="search"
            className="input"
            placeholder="Plate, owner, NIC or chassis…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search vehicles"
          />
          {canEdit && (
            <button type="button" className="btn btn--primary" disabled>
              Register vehicle
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <strong>{error.code}</strong> {error.message}
        </div>
      )}

      <div className="tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Plate</th>
              <th scope="col">Owner</th>
              <th scope="col">NIC</th>
              <th scope="col">Chassis</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && vehicles.length === 0 && (
              <tr>
                <td colSpan={5} className="table__empty">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && vehicles.length === 0 && (
              <tr>
                <td colSpan={5} className="table__empty">
                  No vehicles matched.
                </td>
              </tr>
            )}
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td className="mono">{v.license_plate}</td>
                <td>{v.owner_name}</td>
                <td className="mono">{v.owner_nic}</td>
                <td className="mono">{v.chassis_number}</td>
                <td>
                  <span className={`badge badge--${v.status.toLowerCase()}`}>
                    {v.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="pager" aria-label="Pagination">
          <button
            type="button"
            className="btn"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span className="pager__label">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => setPage(Math.min(pages, page + 1))}
            disabled={page >= pages}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
