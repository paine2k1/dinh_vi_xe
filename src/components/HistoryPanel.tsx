import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { apiClient } from "../services/apiClient";
import type { HistoryItem } from "../types/telemetry";
import { isFiniteNumber } from "../utils/formatters";

interface HistoryPanelProps {
  deviceId: string;
}

const MAX_RANGE_MS = 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 2000;

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildTrackSegments(points: HistoryItem[]): [number, number][][] {
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];

  for (const pt of points) {
    const gps = pt.payload.gps;
    const valid =
      gps.valid === true &&
      isFiniteNumber(gps.lat) &&
      isFiniteNumber(gps.lon) &&
      !(gps.lat === 0 && gps.lon === 0);

    if (valid) {
      current.push([gps.lat as number, gps.lon as number]);
    } else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

export function HistoryPanel({ deviceId }: HistoryPanelProps) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [fromLocal, setFromLocal] = useState(toLocalInputValue(oneHourAgo));
  const [toLocal, setToLocal] = useState(toLocalInputValue(now));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pointCount, setPointCount] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [10.7769, 106.7009],
      zoom: 14,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      abortControllerRef.current?.abort();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    abortControllerRef.current?.abort();
    layerGroupRef.current?.clearLayers();
    setPointCount(0);
    setSegmentCount(0);
    setError(null);
  }, [deviceId]);

  const handleLoadHistory = async () => {
    abortControllerRef.current?.abort();

    const fromDate = new Date(fromLocal);
    const toDate = new Date(toLocal);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      setError("Thời gian không hợp lệ.");
      return;
    }
    if (toDate <= fromDate) {
      setError("Thời điểm kết thúc (to) phải lớn hơn bắt đầu (from).");
      return;
    }
    if (toDate.getTime() - fromDate.getTime() > MAX_RANGE_MS) {
      setError("Khoảng thời gian lịch sử tối đa là 24 giờ.");
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError(null);

    const fromUtc = fromDate.toISOString();
    const toUtc = toDate.toISOString();

    try {
      const byId = new Map<number, HistoryItem>();
      let cursor: string | null = null;

      do {
        const page = await apiClient.getHistory(
          deviceId,
          { from: fromUtc, to: toUtc, limit: PAGE_LIMIT, cursor },
          controller.signal
        );

        for (const item of page.items) {
          byId.set(item.id, item);
        }
        cursor = page.next_cursor;
      } while (cursor !== null);

      const orderedPoints = Array.from(byId.values()).sort((a, b) => a.id - b.id);
      const segments = buildTrackSegments(orderedPoints);

      setPointCount(orderedPoints.length);
      setSegmentCount(segments.length);

      const group = layerGroupRef.current;
      const map = mapRef.current;
      if (group && map) {
        group.clearLayers();
        const allCoords: [number, number][] = [];

        for (const seg of segments) {
          if (seg.length === 1) {
            L.circleMarker(seg[0], { radius: 4, color: "#0ea5e9" }).addTo(group);
          } else {
            L.polyline(seg, { color: "#0ea5e9", weight: 4 }).addTo(group);
          }
          allCoords.push(...seg);
        }

        if (allCoords.length > 0) {
          map.fitBounds(L.latLngBounds(allCoords), { padding: [24, 24] });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Không thể tải lịch sử.");
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  };

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}>
      <strong>Lịch sử hành trình (UTC, tối đa 24h)</strong>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "10px 0" }}>
        <label style={{ fontSize: "13px" }}>
          Từ:{" "}
          <input
            type="datetime-local"
            value={fromLocal}
            onChange={(e) => setFromLocal(e.target.value)}
          />
        </label>
        <label style={{ fontSize: "13px" }}>
          Đến:{" "}
          <input
            type="datetime-local"
            value={toLocal}
            onChange={(e) => setToLocal(e.target.value)}
          />
        </label>
        <button onClick={() => void handleLoadHistory()} disabled={loading}>
          {loading ? "Đang tải..." : "Xem lịch sử"}
        </button>
      </div>

      {error && (
        <div style={{ color: "#dc2626", fontSize: "13px", marginBottom: "8px" }}>
          {error}
        </div>
      )}

      <div style={{ fontSize: "12px", color: "#475569", marginBottom: "8px" }}>
        Tổng số điểm: <strong>{pointCount}</strong> | Số đoạn GPS liên tục:{" "}
        <strong>{segmentCount}</strong>
      </div>

      <div
        ref={mapContainerRef}
        style={{ width: "100%", height: "320px", borderRadius: "6px" }}
      />
    </div>
  );
}