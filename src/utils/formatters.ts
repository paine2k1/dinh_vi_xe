export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatSpeedKmh(
  speedMps: number | null | undefined,
  gpsValidAndFresh: boolean
): string {
  if (!gpsValidAndFresh || !isFiniteNumber(speedMps)) return "--";
  return `${(speedMps * 3.6).toFixed(1)} km/h`;
}

export function formatAngleDeg(
  angle: number | null | undefined,
  imuValid: boolean
): string {
  if (!imuValid || !isFiniteNumber(angle)) return "--";
  return `${angle.toFixed(1)}°`;
}

export function formatCoord(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "--";
  return value.toFixed(6);
}

export function formatAgeMs(ageMs: number | null | undefined): string {
  if (!isFiniteNumber(ageMs) || ageMs < 0) return "--";
  if (ageMs < 1000) return `${Math.round(ageMs)} ms`;
  return `${(ageMs / 1000).toFixed(1)} s`;
}

/**
 * Không bao giờ parse null/"" thành 1970.
 * Nếu clock_valid === false -> ưu tiên hiển thị received_at (giờ server) kèm nhãn rõ ràng.
 */
export function formatTelemetryTime(
  timestamp: string | null | undefined,
  receivedAt: string | null | undefined,
  clockValid: boolean | undefined
): { text: string; isServerFallback: boolean } {
  const safeFormat = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()) || d.getFullYear() <= 1971) return null;
    return d.toLocaleString("vi-VN", { hour12: false });
  };

  if (clockValid === false || !timestamp) {
    const serverTime = safeFormat(receivedAt);
    return {
      text: serverTime ? `${serverTime} (giờ server)` : "--",
      isServerFallback: true,
    };
  }

  const deviceTime = safeFormat(timestamp);
  if (!deviceTime) {
    const serverTime = safeFormat(receivedAt);
    return {
      text: serverTime ? `${serverTime} (giờ server)` : "--",
      isServerFallback: true,
    };
  }

  return { text: deviceTime, isServerFallback: false };
}

export function getDeviceStateMeta(state: string | undefined): {
  label: string;
  color: string;
} {
  switch (state) {
    case "online":
      return { label: "Online", color: "#16a34a" };
    case "stale":
      return { label: "Dữ liệu cũ (Stale)", color: "#d97706" };
    case "offline":
      return { label: "Offline", color: "#dc2626" };
    case "no_data":
    default:
      return { label: "Chưa có dữ liệu", color: "#64748b" };
  }
}