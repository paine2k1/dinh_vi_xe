export type DataSourceMode = "MOCK" | "REAL";

export interface AppConfig {
  dataSourceMode: DataSourceMode;
  apiBaseUrl: string;
  deviceId: string;
  livePollIntervalMs: number;
  liveTimeoutMs: number;
  maxLiveEvents: number;
  maxHistoryHours: number;
  maxHistoryLimit: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(raw: string | undefined): string {
  const fallback = "http://localhost:8000/api/v1";
  const value = (raw ?? fallback).trim().replace(/\/+$/, "");
  return value || fallback;
}

function parseMode(raw: string | undefined): DataSourceMode {
  return raw === "REAL" ? "REAL" : "MOCK";
}

export const APP_CONFIG: AppConfig = Object.freeze({
  dataSourceMode: parseMode(import.meta.env.VITE_DATA_SOURCE_MODE),
  apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
  deviceId: (import.meta.env.VITE_DEVICE_ID || "vehicle_01").trim(),
  livePollIntervalMs: parsePositiveInt(import.meta.env.VITE_LIVE_POLL_INTERVAL_MS, 500),
  liveTimeoutMs: parsePositiveInt(import.meta.env.VITE_LIVE_TIMEOUT_MS, 1500),
  maxLiveEvents: parsePositiveInt(import.meta.env.VITE_MAX_LIVE_EVENTS, 200),
  maxHistoryHours: parsePositiveInt(import.meta.env.VITE_MAX_HISTORY_HOURS, 24),
  maxHistoryLimit: parsePositiveInt(import.meta.env.VITE_MAX_HISTORY_LIMIT, 2000),
});