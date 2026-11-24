import type { BackendStatus, LastKnownPosition } from "../hooks/useLivePolling";
import type { LiveResponse } from "../types/telemetry";
import {
  formatAgeMs,
  formatAngleDeg,
  formatCoord,
  formatSpeedKmh,
  formatTelemetryTime,
  getDeviceStateMeta,
} from "../utils/formatters";

interface TelemetryPanelProps {
  backendStatus: BackendStatus;
  backendError: string | null;
  isStaleFromServerError: boolean;
  liveData: LiveResponse | null;
  lastKnownPosition: LastKnownPosition | null;
}

export function TelemetryPanel({
  backendStatus,
  backendError,
  isStaleFromServerError,
  liveData,
  lastKnownPosition,
}: TelemetryPanelProps) {
  const isNoData =
    !liveData ||
    liveData.device_state === "no_data" ||
    liveData.telemetry === null;

  const stateMeta = getDeviceStateMeta(liveData?.device_state);
  const telemetry = liveData?.telemetry ?? null;
  const gps = telemetry?.gps ?? null;
  const imu = telemetry?.imu ?? null;

  const gpsFreshAndValid =
    !isNoData &&
    Boolean(gps?.valid) &&
    (gps?.age_ms === null || gps?.age_ms === undefined || gps.age_ms <= 3000);

  const imuValid = !isNoData && Boolean(imu?.valid);

  const timeInfo = formatTelemetryTime(
    telemetry?.timestamp,
    liveData?.last_received_at,
    telemetry?.clock_valid
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Cảnh báo mất kết nối server (F10) - tách biệt với device_state */}
      {backendStatus === "server_unreachable" && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #ef4444",
            color: "#991b1b",
            padding: "10px 12px",
            borderRadius: "6px",
            fontSize: "14px",
          }}
        >
          <strong>Mất kết nối server</strong> ({backendError ?? "Lỗi mạng"}).
          {isStaleFromServerError && " Đang giữ dữ liệu cũ gần nhất."}
        </div>
      )}

      {/* Trạng thái thiết bị & tuổi telemetry do backend trả về */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
        }}
      >
        <div>
          <div style={{ fontSize: "12px", color: "#64748b" }}>
            Trạng thái thiết bị
          </div>
          <div style={{ fontWeight: 700, color: stateMeta.color }}>
            {stateMeta.label}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "12px", color: "#64748b" }}>
            Tuổi telemetry (backend)
          </div>
          <div style={{ fontWeight: 600 }}>
            {isNoData ? "--" : formatAgeMs(liveData?.telemetry_age_ms)}
          </div>
        </div>
      </div>

      {/* Khối thông số GPS */}
      <div
        style={{
          padding: "12px",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <strong>GPS</strong>
          {!isNoData && !gpsFreshAndValid && (
            <span style={{ color: "#d97706", fontSize: "12px" }}>
              {lastKnownPosition ? "Vị trí cuối đã biết" : "GPS chưa hợp lệ"}
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <small style={{ color: "#64748b" }}>Tốc độ</small>
            <div style={{ fontSize: "18px", fontWeight: 700 }}>
              {formatSpeedKmh(gps?.speed_mps, gpsFreshAndValid)}
            </div>
          </div>
          <div>
            <small style={{ color: "#64748b" }}>Tuổi GPS</small>
            <div style={{ fontSize: "16px", fontWeight: 600 }}>
              {isNoData ? "--" : formatAgeMs(gps?.age_ms)}
            </div>
          </div>
          <div>
            <small style={{ color: "#64748b" }}>Vĩ độ (Lat)</small>
            <div>
              {gpsFreshAndValid
                ? formatCoord(gps?.lat)
                : lastKnownPosition
                ? formatCoord(lastKnownPosition.lat)
                : "--"}
            </div>
          </div>
          <div>
            <small style={{ color: "#64748b" }}>Kinh độ (Lon)</small>
            <div>
              {gpsFreshAndValid
                ? formatCoord(gps?.lon)
                : lastKnownPosition
                ? formatCoord(lastKnownPosition.lon)
                : "--"}
            </div>
          </div>
        </div>
      </div>

      {/* Khối thông số IMU */}
      <div
        style={{
          padding: "12px",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <strong>IMU (Độ nghiêng)</strong>
          {!isNoData && !imuValid && (
            <span style={{ color: "#dc2626", fontSize: "12px", fontWeight: 600 }}>
              Lỗi IMU
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div>
            <small style={{ color: "#64748b" }}>Roll</small>
            <div style={{ fontSize: "18px", fontWeight: 700 }}>
              {formatAngleDeg(imu?.roll_deg, imuValid)}
            </div>
          </div>
          <div>
            <small style={{ color: "#64748b" }}>Pitch</small>
            <div style={{ fontSize: "18px", fontWeight: 700 }}>
              {formatAngleDeg(imu?.pitch_deg, imuValid)}
            </div>
          </div>
        </div>
      </div>

      {/* Thời gian cập nhật & clock_valid */}
      <div style={{ fontSize: "13px", color: "#475569" }}>
        Cập nhật lúc: <strong>{isNoData ? "--" : timeInfo.text}</strong>
        {!isNoData && telemetry?.clock_valid === false && (
          <span style={{ color: "#d97706", marginLeft: "6px" }}>
            (Đồng hồ thiết bị chưa đồng bộ)
          </span>
        )}
      </div>
    </div>
  );
}