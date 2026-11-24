import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LastKnownPosition } from "../hooks/useLivePolling";
import type { LiveResponse } from "../types/telemetry";
import { isFiniteNumber } from "../utils/formatters";

interface LiveMapProps {
  deviceId: string;
  liveData: LiveResponse | null;
  lastKnownPosition: LastKnownPosition | null;
}

const DEFAULT_CENTER: [number, number] = [10.7769, 106.7009]; // TP.HCM
const MAX_TRACK_POINTS = 500;

export function LiveMap({
  deviceId,
  liveData,
  lastKnownPosition,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const geofenceCircleRef = useRef<L.Circle | null>(null);
  const hasCenteredRef = useRef<boolean>(false);

  // 1. Khởi tạo bản đồ & các layer ĐÚNG 1 LẦN DUY NHẤT
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 15,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    // Tạo sẵn polyline rỗng
    const polyline = L.polyline([], {
      color: "#2563eb",
      weight: 4,
      opacity: 0.85,
    }).addTo(map);

    // Tạo sẵn marker (chưa addTo(map) để tránh đặt ở 0,0 khi chưa có dữ liệu)
    const marker = L.circleMarker(DEFAULT_CENTER, {
      radius: 8,
      color: "#ffffff",
      weight: 2,
      fillColor: "#2563eb",
      fillOpacity: 1,
    });

    // Tạo sẵn vòng geofence (chưa addTo(map) cho đến khi có applied_config hợp lệ)
    const geofenceCircle = L.circle(DEFAULT_CENTER, {
      radius: 0,
      color: "#ef4444",
      weight: 2,
      fillColor: "#ef4444",
      fillOpacity: 0.12,
    });

    mapRef.current = map;
    polylineRef.current = polyline;
    markerRef.current = marker;
    geofenceCircleRef.current = geofenceCircle;

    return () => {
      map.remove();
      mapRef.current = null;
      polylineRef.current = null;
      markerRef.current = null;
      geofenceCircleRef.current = null;
    };
  }, []);

  // 2. Xóa đường đi cũ khi đổi device_id
  useEffect(() => {
    hasCenteredRef.current = false;
    polylineRef.current?.setLatLngs([]);
    if (mapRef.current && markerRef.current?.remove) {
      markerRef.current.remove();
    }
    if (mapRef.current && geofenceCircleRef.current?.remove) {
      geofenceCircleRef.current.remove();
    }
  }, [deviceId]);

  // 3. Cập nhật vị trí marker, đường đi và geofence khi có snapshot mới
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    const polyline = polylineRef.current;
    const geofenceCircle = geofenceCircleRef.current;
    if (!map || !marker || !polyline || !geofenceCircle) return;

    // --- Cập nhật Geofence từ applied_config ---
    const gf = liveData?.applied_config?.geofence;
    if (
      gf &&
      isFiniteNumber(gf.lat) &&
      isFiniteNumber(gf.lon) &&
      isFiniteNumber(gf.radius_m) &&
      gf.radius_m > 0
    ) {
      geofenceCircle.setLatLng([gf.lat, gf.lon]);
      geofenceCircle.setRadius(gf.radius_m);
      if (!map.hasLayer(geofenceCircle)) {
        geofenceCircle.addTo(map);
      }
    } else if (map.hasLayer(geofenceCircle)) {
      geofenceCircle.remove();
    }

    // --- Quy tắc GPS & (0,0) ---
    const isNoData =
      !liveData ||
      liveData.device_state === "no_data" ||
      liveData.telemetry === null;

    if (isNoData) {
      if (map.hasLayer(marker)) marker.remove();
      return;
    }

    const gps = liveData.telemetry?.gps;
    const hasValidCoords =
      gps &&
      gps.valid === true &&
      isFiniteNumber(gps.lat) &&
      isFiniteNumber(gps.lon) &&
      !(gps.lat === 0 && gps.lon === 0) &&
      (gps.age_ms === null || gps.age_ms <= 3000);

    if (hasValidCoords) {
      const point: [number, number] = [gps.lat as number, gps.lon as number];
      marker.setLatLng(point);
      marker.setStyle({ fillColor: "#2563eb" });
      marker.unbindTooltip();
      if (!map.hasLayer(marker)) marker.addTo(map);

      // Nối thêm vào đường đi (tránh lặp điểm trùng liên tiếp)
      const latLngs = polyline.getLatLngs() as L.LatLng[];
      const last = latLngs[latLngs.length - 1];
      if (!last || last.lat !== point[0] || last.lng !== point[1]) {
        polyline.addLatLng(point);
        if (latLngs.length > MAX_TRACK_POINTS) {
          polyline.setLatLngs(latLngs.slice(-MAX_TRACK_POINTS));
        }
      }

      if (!hasCenteredRef.current) {
        map.setView(point, 16);
        hasCenteredRef.current = true;
      }
    } else if (lastKnownPosition) {
      // GPS không hợp lệ hoặc age_ms > 3000: KHÔNG nối đường đi, giữ marker ở vị trí cuối
      const fallbackPoint: [number, number] = [
        lastKnownPosition.lat,
        lastKnownPosition.lon,
      ];
      marker.setLatLng(fallbackPoint);
      marker.setStyle({ fillColor: "#f59e0b" });
      marker.bindTooltip("Vị trí cuối đã biết", {
        permanent: true,
        direction: "top",
        offset: [0, -8],
      });
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else {
      // Chưa từng có tọa độ hợp lệ -> không đặt marker ở (0,0)
      if (map.hasLayer(marker)) marker.remove();
    }
  }, [liveData, lastKnownPosition]);

  const showNoDataOverlay =
    !liveData ||
    liveData.device_state === "no_data" ||
    liveData.telemetry === null;

  return (
    <div style={{ position: "relative", width: "100%", height: "420px" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", borderRadius: "8px" }}
      />
      {showNoDataOverlay && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "rgba(15, 23, 42, 0.85)",
            color: "#fff",
            padding: "6px 14px",
            borderRadius: "6px",
            fontSize: "14px",
          }}
        >
          Chưa có dữ liệu GPS
        </div>
      )}
    </div>
  );
}