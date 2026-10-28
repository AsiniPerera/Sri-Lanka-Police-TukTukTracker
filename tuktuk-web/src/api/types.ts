/**
 * Types mirroring the TukTukTracker API.
 *
 * Field names follow the Mongoose models in tuktuk-tracker/src/models/ exactly
 * (snake_case, `id` rather than `_id` because every schema's toJSON transform
 * renames it).
 */

export const ROLES = {
  ADMIN_HQ: 'ADMIN_HQ',
  PROVINCIAL_OFFICER: 'PROVINCIAL_OFFICER',
  DISTRICT_OFFICER: 'DISTRICT_OFFICER',
  STATION_OFFICER: 'STATION_OFFICER',
  DEVICE_CLIENT: 'DEVICE_CLIENT',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const VEHICLE_STATUS = {
  REGISTERED: 'REGISTERED',
  SUSPENDED: 'SUSPENDED',
  WANTED: 'WANTED',
  DECOMMISSIONED: 'DECOMMISSIONED',
} as const;

export type VehicleStatus = (typeof VEHICLE_STATUS)[keyof typeof VEHICLE_STATUS];

/** GET /auth/me — the local User record, which owns role and scope_id. */
export interface Me {
  id: string;
  username: string;
  full_name?: string;
  role: Role;
  scope_id: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  last_login: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** GET /live — LiveStatus enriched with plate + status by liveController.list. */
export interface LiveVehicle {
  id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  last_updated: string;
  current_district_id: string | null;
  current_province_id: string | null;
  is_online: boolean;
  license_plate: string | null;
  vehicle_status: VehicleStatus | null;
}

/** GET /live/stats */
export interface LiveStats {
  total_vehicles: number;
  online_now: number;
  offline: number;
  wanted: number;
  suspended: number;
  online_threshold_minutes: number;
}

export interface Vehicle {
  id: string;
  license_plate: string;
  chassis_number: string;
  engine_number: string;
  owner_name: string;
  owner_nic: string;
  station_id: string;
  status: VehicleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Province {
  id: string;
  name: string;
}

export interface District {
  id: string;
  name: string;
  province_id: string;
}

/**
 * The API uses two different envelopes (see src/utils/apiResponse.js):
 *   success()   -> { success, message, data }
 *   paginated() -> { success, count, total, page, pages, limit, data }
 * Keeping the pagination fields optional lets one type cover both.
 */
export interface ApiEnvelope<T> {
  success: true;
  message?: string;
  data: T;
  count?: number;
  total?: number;
  page?: number;
  pages?: number;
  limit?: number;
}

export interface ApiErrorBody {
  success: false;
  /** Machine-readable code, e.g. MISSING_TOKEN, INSUFFICIENT_PERMISSIONS. */
  error: string;
  message: string;
}
