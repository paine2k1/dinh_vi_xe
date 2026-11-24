import { useEffect, useState } from "react";
import { apiClient } from "../services/apiClient";
import type { LiveResponse, VehicleConfigBody } from "../types/telemetry";

interface ConfigFormProps {
  deviceId: string;
  liveData: LiveResponse | null;
}

const DEFAULT_SUGGESTION = {
  lat: "10.7769",
  lon: "106.7009",
  radius_m: "100",
  hysteresis_m: "10",
  threshold_deg: "35",
  hold_ms: "1000",
};

export function ConfigForm({ deviceId, liveData }: ConfigFormProps) {
  const [lat, setLat] = useState(DEFAULT_SUGGESTION.lat);
  const [lon, setLon] = useState(DEFAULT_SUGGESTION.lon);
  const [radiusM, setRadiusM] = useState(DEFAULT_SUGGESTION.radius_m);
  const [hysteresisM, setHysteresisM] = useState(DEFAULT_SUGGESTION.hysteresis_m);
  const [thresholdDeg, setThresholdDeg] = useState(DEFAULT_SUGGESTION.threshold_deg);
  const [holdMs, setHoldMs] = useState(DEFAULT_SUGGESTION.hold_ms);

  const [initializedForDevice, setInitializedForDevice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localPending, setLocalPending] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  useEffect(() => {
    setInitializedForDevice(null);
    setLocalPending(false);
    setValidationError(null);
    setSubmitMessage(null);
  }, [deviceId]);

  useEffect(() => {
    const applied = liveData?.applied_config;
    if (!applied || initializedForDevice === deviceId) return;

    setLat(String(applied.geofence.lat));
    setLon(String(applied.geofence.lon));
    setRadiusM(String(applied.geofence.radius_m));
    setHysteresisM(String(applied.geofence.hysteresis_m));
    setThresholdDeg(String(applied.tilt.threshold_deg));
    setHoldMs(String(applied.tilt.hold_ms));
    setInitializedForDevice(deviceId);
  }, [deviceId, liveData?.applied_config, initializedForDevice]);

  const configStatus = liveData?.config_status ?? null;
  const currentState = configStatus?.state;

  useEffect(() => {
    if (!currentState) return;
    if (currentState === "pending") {
      setLocalPending(true);
    } else {
      setLocalPending(false);
    }
  }, [currentState]);

  const isPending = localPending || currentState === "pending";
  const isApplied = currentState === "applied" || currentState === "applied_late";
  const isFailed =
    currentState === "rejected" ||
    currentState === "rejected_late" ||
    currentState === "timeout" ||
    currentState === "failed";

  const validateAndBuildPayload = (): VehicleConfigBody | null => {
    const nLat = Number(lat);
    const nLon = Number(lon);
    const nRadius = Number(radiusM);
    const nHyst = Number(hysteresisM);
    const nThreshold = Number(thresholdDeg);
    const nHold = Number(holdMs);

    if (!Number.isFinite(nLat) || nLat < -90 || nLat > 90) {
      setValidationError("geofence.lat phải là số trong khoảng [-90, 90].");
      return null;
    }
    if (!Number.isFinite(nLon) || nLon < -180 || nLon > 180) {
      setValidationError("geofence.lon phải là số trong khoảng [-180, 180].");
      return null;
    }
    if (!Number.isFinite(nRadius) || nRadius < 20 || nRadius > 5000) {
      setValidationError("geofence.radius_m phải trong khoảng [20, 5000] m.");
      return null;
    }
    if (!Number.isFinite(nHyst) || nHyst < 0 || nHyst > nRadius / 2) {
      setValidationError(
        `geofence.hysteresis_m phải trong khoảng [0, ${(nRadius / 2).toFixed(1)}] m.`
      );
      return null;
    }
    if (!Number.isFinite(nThreshold) || nThreshold < 10 || nThreshold > 80) {
      setValidationError("tilt.threshold_deg phải trong khoảng [10, 80] độ.");
      return null;
    }
    if (!Number.isInteger(nHold) || nHold < 200 || nHold > 5000) {
      setValidationError("tilt.hold_ms phải là số nguyên trong khoảng [200, 5000] ms.");
      return null;
    }

    setValidationError(null);
    return {
      geofence: {
        lat: nLat,
        lon: nLon,
        radius_m: nRadius,
        hysteresis_m: nHyst,
      },
      tilt: {
        threshold_deg: nThreshold,
        hold_ms: nHold,
      },
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending || submitting) return;

    const payload = validateAndBuildPayload();
    if (!payload) return;

    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const res = await apiClient.postConfig(deviceId, payload);
      if (res.state === "pending") {
        setLocalPending(true);
        setSubmitMessage("Đã gửi lệnh cấu hình. Đang chờ thiết bị xác nhận...");
      }
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : "Gửi cấu hình thất bại."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px" }}
    >
      <strong>Cấu hình Geofence & Cảnh báo nghiêng</strong>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
          marginTop: "10px",
          fontSize: "13px",
        }}
      >
        <label>
          Vĩ độ tâm (lat):
          <input
            type="number"
            step="any"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            disabled={isPending}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Kinh độ tâm (lon):
          <input
            type="number"
            step="any"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            disabled={isPending}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Bán kính (20–5000 m):
          <input
            type="number"
            step="any"
            value={radiusM}
            onChange={(e) => setRadiusM(e.target.value)}
            disabled={isPending}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Hysteresis (0 – R/2 m):
          <input
            type="number"
            step="any"
            value={hysteresisM}
            onChange={(e) => setHysteresisM(e.target.value)}
            disabled={isPending}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Ngưỡng nghiêng (10–80°):
          <input
            type="number"
            step="any"
            value={thresholdDeg}
            onChange={(e) => setThresholdDeg(e.target.value)}
            disabled={isPending}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Thời gian giữ (200–5000 ms):
          <input
            type="number"
            step="1"
            value={holdMs}
            onChange={(e) => setHoldMs(e.target.value)}
            disabled={isPending}
            style={{ width: "100%" }}
          />
        </label>
      </div>

      <div style={{ marginTop: "10px", fontSize: "13px" }}>
        {isPending && (
          <div style={{ color: "#d97706", fontWeight: 600 }}>
            Đang chờ thiết bị áp dụng cấu hình...
          </div>
        )}
        {!isPending && isApplied && (
          <div style={{ color: "#16a34a", fontWeight: 600 }}>
            Thiết bị đã áp dụng cấu hình ({currentState}).
          </div>
        )}
        {!isPending && isFailed && (
          <div style={{ color: "#dc2626", fontWeight: 600 }}>
            Cấu hình thất bại ({currentState}
            {configStatus?.reason ? `: ${configStatus.reason}` : ""}). Đang giữ
            cấu hình cũ — bấm Gửi lại nếu muốn thử lại.
          </div>
        )}
        {submitMessage && !validationError && (
          <div style={{ color: "#2563eb" }}>{submitMessage}</div>
        )}
        {validationError && (
          <div style={{ color: "#dc2626" }}>{validationError}</div>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending || submitting}
        style={{ marginTop: "10px", padding: "6px 14px" }}
      >
        {isPending
          ? "Đang chờ thiết bị..."
          : isFailed
          ? "Gửi lại cấu hình"
          : "Lưu & Gửi cấu hình"}
      </button>
    </form>
  );
}