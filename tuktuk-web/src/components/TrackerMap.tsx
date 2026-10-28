import { useMemo, useState } from 'react';
import Map, { Marker, NavigationControl, Popup, ScaleControl } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LiveVehicle } from '../api/types';

/**
 * A tokenless raster style. MapLibre needs no API key, and OpenStreetMap tiles
 * keep local development free of signup friction.
 *
 * Before production: OSM's tile usage policy forbids heavy application traffic
 * against tile.openstreetmap.org. Swap in your own tile server or a commercial
 * provider's style URL here.
 */
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/** Centred on Sri Lanka. */
const INITIAL_VIEW = { longitude: 80.7718, latitude: 7.8731, zoom: 7 };

interface Props {
  vehicles: LiveVehicle[];
  selectedId: string | null;
  onSelect: (vehicleId: string | null) => void;
}

function markerTone(v: LiveVehicle): string {
  if (v.vehicle_status === 'WANTED') return 'wanted';
  if (v.vehicle_status === 'SUSPENDED') return 'suspended';
  return v.is_online ? 'online' : 'offline';
}

function minutesAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export default function TrackerMap({ vehicles, selectedId, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const selected = useMemo(
    () => vehicles.find((v) => v.vehicle_id === selectedId) ?? null,
    [vehicles, selectedId],
  );

  return (
    <div className="map">
      <Map
        initialViewState={INITIAL_VIEW}
        mapStyle={OSM_STYLE}
        style={{ width: '100%', height: '100%' }}
        attributionControl={{ compact: true }}
        onClick={() => onSelect(null)}
      >
        <NavigationControl position="top-right" />
        <ScaleControl position="bottom-left" />

        {vehicles.map((v) => (
          <Marker
            key={v.vehicle_id}
            longitude={v.longitude}
            latitude={v.latitude}
            anchor="center"
            onClick={(e) => {
              // Without this the click bubbles to the map and immediately deselects.
              e.originalEvent.stopPropagation();
              onSelect(v.vehicle_id);
            }}
          >
            <button
              type="button"
              className={[
                'pin',
                `pin--${markerTone(v)}`,
                selectedId === v.vehicle_id ? 'pin--selected' : '',
                hovered === v.vehicle_id ? 'pin--hover' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`${v.license_plate ?? 'Unknown plate'} — ${
                v.is_online ? 'online' : 'offline'
              }, ${Math.round(v.speed)} km/h`}
              onMouseEnter={() => setHovered(v.vehicle_id)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Rotate only when actually moving; a heading of 0 at a standstill is meaningless. */}
              <span
                className="pin__arrow"
                style={{ transform: `rotate(${v.speed > 1 ? v.heading : 0}deg)` }}
              />
            </button>
          </Marker>
        ))}

        {selected && (
          <Popup
            longitude={selected.longitude}
            latitude={selected.latitude}
            anchor="bottom"
            offset={18}
            closeOnClick={false}
            onClose={() => onSelect(null)}
            className="popup"
          >
            <div className="popup__body">
              <strong className="popup__plate">
                {selected.license_plate ?? 'Unknown plate'}
              </strong>
              <div className="popup__row">
                <span
                  className={`badge badge--${selected.is_online ? 'online' : 'offline'}`}
                >
                  {selected.is_online ? 'Online' : 'Offline'}
                </span>
                {selected.vehicle_status && (
                  <span
                    className={`badge badge--${selected.vehicle_status.toLowerCase()}`}
                  >
                    {selected.vehicle_status}
                  </span>
                )}
              </div>
              <dl className="popup__facts">
                <dt>Speed</dt>
                <dd>{Math.round(selected.speed)} km/h</dd>
                <dt>Heading</dt>
                <dd>{Math.round(selected.heading)}°</dd>
                <dt>Last ping</dt>
                <dd>{minutesAgo(selected.last_updated)}</dd>
                <dt>Position</dt>
                <dd>
                  {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                </dd>
              </dl>
            </div>
          </Popup>
        )}
      </Map>

      <div className="map__legend">
        <span className="legend__item">
          <i className="legend__dot legend__dot--online" /> Online
        </span>
        <span className="legend__item">
          <i className="legend__dot legend__dot--offline" /> Offline
        </span>
        <span className="legend__item">
          <i className="legend__dot legend__dot--wanted" /> Wanted
        </span>
        <span className="legend__item">
          <i className="legend__dot legend__dot--suspended" /> Suspended
        </span>
      </div>
    </div>
  );
}
