import type { EventItem } from "../types/telemetry";
import { formatCoord, formatTelemetryTime, isFiniteNumber } from "../utils/formatters";

interface EventListProps {
  events: EventItem[];
  hasMoreEvents?: boolean;
}

function getEventLabel(type: string): { label: string; color: string } {
  switch (type) {
    case "geofence_enter":
      return { label: "Vào vùng geofence", color: "#2563eb" };
    case "geofence_exit":
      return { label: "Ra khỏi vùng geofence", color: "#d97706" };
    case "tilt_alert":
      return { label: "Cảnh báo độ nghiêng", color: "#dc2626" };
    default:
      return { label: type, color: "#475569" };
  }
}

export function EventList({ events, hasMoreEvents }: EventListProps) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <strong>Cảnh báo Live ({events.length}/200)</strong>
        {hasMoreEvents && (
          <span style={{ fontSize: "12px", color: "#2563eb" }}>
            Đang tải thêm ở chu kỳ tiếp theo...
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <div style={{ color: "#64748b", fontSize: "14px" }}>Chưa có cảnh báo nào.</div>
      ) : (
        <div style={{ maxHeight: "280px", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "6px" }}>ID</th>
                <th style={{ padding: "6px" }}>Loại cảnh báo</th>
                <th style={{ padding: "6px" }}>Thời gian</th>
                <th style={{ padding: "6px" }}>Vị trí</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const p = ev.payload;
                const meta = getEventLabel(p.event_type);
                const timeInfo = formatTelemetryTime(
                  p.timestamp,
                  ev.received_at,
                  p.clock_valid
                );
                const hasValidPos =
                  p.gps.valid &&
                  isFiniteNumber(p.gps.lat) &&
                  isFiniteNumber(p.gps.lon) &&
                  !(p.gps.lat === 0 && p.gps.lon === 0);

                return (
                  <tr key={ev.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "6px" }}>#{ev.id}</td>
                    <td style={{ padding: "6px", fontWeight: 600, color: meta.color }}>
                      {meta.label}
                    </td>
                    <td style={{ padding: "6px" }}>{timeInfo.text}</td>
                    <td style={{ padding: "6px" }}>
                      {hasValidPos
                        ? `${formatCoord(p.gps.lat)}, ${formatCoord(p.gps.lon)}`
                        : "--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}