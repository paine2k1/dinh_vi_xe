export type DeviceState = "no_data" | "online" | "stale" | "offline";
export type GeofenceState = "inside" | "outside" | "unknown";
export type EventType = "geofence_enter" | "geofence_exit" | "tilt_alert";
export type TimeSource = "device" | "server";
export type ConfigRequestState =
  | "pending"
  | "applied"
  | "rejected"
  | "timeout"
  | "applied_late"
  | "rejected_late"
  | "failed";

export interface GpsData {
  valid: boolean;
  lat: number | null;
  lon: number | null;
  speed_mps: number | null;
  age_ms: number | null;
}

export interface ImuData {
  valid: boolean;
  roll_deg: number | null;
  pitch_deg: number | null;
}

export interface TelemetryPayload {
  schema_version: 1;
  type: "telemetry";
  device_id: string;
  boot_id: string;
  seq: number;
  uptime_ms: number;
  timestamp: string | null;
  clock_valid: boolean;
  gps: GpsData;
  imu: ImuData;
  geofence_state: GeofenceState;
  alarm_active: boolean;
  config_version: number;
}

export interface EventPayload {
  schema_version: 1;
  type: "event";
  device_id: string;
  boot_id: string;
  seq: number;
  uptime_ms: number;
  timestamp: string | null;
  clock_valid: boolean;
  event_type: EventType;
  value: number | null;
  unit: string | null;
  gps: {
    valid: boolean;
    lat: number | null;
    lon: number | null;
    age_ms: number | null;
  };
  config_version: number;
}

export interface EventItem {
  id: number;
  received_at: string;
  time_source: TimeSource;
  payload: EventPayload;
}

export interface HistoryItem {
  id: number;
  received_at: string;
  time_source: TimeSource;
  payload: TelemetryPayload;
}

export interface GeofenceConfig {
  lat: number;
  lon: number;
  radius_m: number;
  hysteresis_m: number;
}

export interface TiltConfig {
  threshold_deg: number;
  hold_ms: number;
}

export interface VehicleConfigBody {
  geofence: GeofenceConfig;
  tilt: TiltConfig;
}

export interface AppliedConfig extends VehicleConfigBody {
  config_version: number;
  applied_at?: string;
}

export interface ConfigRequestStatus {
  request_id: string;
  config_version: number;
  state: ConfigRequestState;
  reason?: string | null;
}

export interface LiveResponse {
  server_time: string;
  device_state: DeviceState;
  telemetry_age_ms: number | null;
  last_received_at: string | null;
  telemetry: TelemetryPayload | null;
  events: EventItem[];
  next_event_id: number;
  has_more_events: boolean;
  config_status: ConfigRequestStatus | null;
  applied_config?: AppliedConfig | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  next_cursor: string | null;
}

export interface ConfigGetResponse {
  applied_config: AppliedConfig | null;
  latest_request: ConfigRequestStatus | null;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}