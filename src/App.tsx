import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import { apiClient } from "./services/apiClient";
import type { EventItem, LiveResponse } from "./types/telemetry";
import { EventList } from "./components/EventList";
import { HistoryPanel } from "./components/HistoryPanel";
import { ConfigForm } from "./components/ConfigForm";

export default function App() {
  const [deviceId, setDeviceId] = useState("esp32-01");
  const [liveData, setLiveData] = useState<LiveResponse | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let sinceEventId = 0;

    const poll = async () => {
      try {
        const res = await apiClient.getLive(deviceId, sinceEventId);
        if (!active) return;

        setLiveData(res);
        setError(null);

        if (res.events.length > 0) {
          setEvents((prev) => {
            const map = new Map<number, EventItem>();
            for (const item of [...res.events, ...prev]) {
              map.set(item.id, item);
            }
            return Array.from(map.values())
              .sort((a, b) => b.id - a.id)
              .slice(0, 200);
          });
          sinceEventId = res.next_event_id;
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Lỗi tải dữ liệu live.");
      }
    };

    setEvents([]);
    void poll();
    const timer = setInterval(() => void poll(), 2000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [deviceId]);

  const tel = liveData?.telemetry;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "16px", fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ margin: 0 }}>Giám sát phương tiện & Geofencing</h2>
        <label style={{ fontSize: "14px" }}>
          Device ID:{" "}
          <input
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            style={{ padding: "4px 8px" }}
          />
        </label>
      </header>

      {error && (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "8px 12px", borderRadius: "6px", marginBottom: "12px" }}>
          {error}
        </div>
      )}

      {/* Thanh thông số Live */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "8px",
          padding: "12px",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          marginBottom: "16px",
          fontSize: "14px",
        }}
      >
        <div>Trạng thái: <strong>{liveData?.device_state ?? "--"}</strong></div>
        <div>Geofence: <strong>{tel?.geofence_state ?? "--"}</strong></div>
        <div>Cảnh báo: <strong>{tel?.alarm_active ? "ĐANG KÊU" : "Bình thường"}</strong></div>
        <div>
          GPS:{" "}
          <strong>
            {tel?.gps.valid && tel.gps.lat != null && tel.gps.lon != null
              ? `${tel.gps.lat.toFixed(5)}, ${tel.gps.lon.toFixed(5)}`
              : "--"}
          </strong>
        </div>
        <div>
          Nghiêng (R/P):{" "}
          <strong>
            {tel?.imu.valid
              ? `${tel.imu.roll_deg ?? "--"}° / ${tel.imu.pitch_deg ?? "--"}°`
              : "--"}
          </strong>
        </div>
      </div>

      {/* Khu vực chính */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
        <ConfigForm deviceId={deviceId} liveData={liveData} />
        <EventList events={events} hasMoreEvents={liveData?.has_more_events} />
      </div>

      <HistoryPanel deviceId={deviceId} />
    </div>
  );
}