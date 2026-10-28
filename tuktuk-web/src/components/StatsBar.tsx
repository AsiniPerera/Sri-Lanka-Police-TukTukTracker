import type { LiveStats } from '../api/types';

interface Props {
  stats: LiveStats | null;
}

interface Tile {
  label: string;
  value: number;
  tone?: 'online' | 'offline' | 'wanted' | 'suspended';
}

export default function StatsBar({ stats }: Props) {
  if (!stats) {
    return (
      <div className="stats stats--loading" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="stat stat--skeleton" />
        ))}
      </div>
    );
  }

  const tiles: Tile[] = [
    { label: 'Registered', value: stats.total_vehicles },
    { label: 'Online now', value: stats.online_now, tone: 'online' },
    { label: 'Offline', value: stats.offline, tone: 'offline' },
    { label: 'Wanted', value: stats.wanted, tone: 'wanted' },
    { label: 'Suspended', value: stats.suspended, tone: 'suspended' },
  ];

  return (
    <div className="stats">
      {tiles.map((tile) => (
        <div key={tile.label} className={`stat${tile.tone ? ` stat--${tile.tone}` : ''}`}>
          <span className="stat__value">{tile.value.toLocaleString()}</span>
          <span className="stat__label">{tile.label}</span>
        </div>
      ))}
      <div className="stats__note">
        “Online” = pinged within {stats.online_threshold_minutes} min
      </div>
    </div>
  );
}
