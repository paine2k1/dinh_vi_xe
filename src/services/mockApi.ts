import type {
  AppliedConfig,
  ConfigGetResponse,
  ConfigRequestStatus,
  EventItem,
  HistoryItem,
  LiveResponse,
  PaginatedResponse,
  VehicleConfigBody,
} from "../types/telemetry";

export type MockScenario =
  | "normal"
  | "no_data"
  | "gps_invalid"
  | "imu_invalid"
  | "stale"
  | "offline"
  | "backend_error";

export type MockConfigOutcome = "applied" | "rejected" | "timeout" | "applied_late";

export const mockControl = {
  scenario: "normal" as MockScenario,
  delayMs: 60, // Đổi thành 900 để test F02
  configOutcome: "applied" as MockConfigOutcome,
  duplicateEventsTest: false, // Bật true để test chống trùng F06
};

let seq = 1;
let step = 0;
let configVersion = 1;
let appliedConfig: AppliedConfig | null = {
  config_version: 1,
  geofence: { lat: 10.7725, lon: 106.6579, radius_m: 300, hysteresis_m: 20 },
  tilt: { threshold_deg: 45, hold_ms: 1000 },
};
let latestRequest: ConfigRequestStatus | null = null;
let pendingConfigDraft: VehicleConfigBody | null = null;

// Tạo sẵn 100 event giả lập cho F06
const mockEvents: EventItem[] = Array.from({ length: 100 }, (_, i) => {
  const id = i + 1;
  const isTilt = id % 3 === 0;
  return {
    id,
    received_at: new Date(Date.now() - (100 - id) * 5000).toISOString(),
    time_source: "device",
    payload: {
      schema_version: 1,
      type: "event",
      device_id: "vehicle_01",
      boot_id: "boot_mock_01",
      seq: id,
      uptime_ms: id * 5000,
      timestamp: new Date(Date.now() - (100 - id) * 5000).toISOString(),
      clock_valid: true,
      event_type: isTilt ? "tilt_alert" : id % 2 === 0 ? "geofence_exit" : "geofence_enter",
      value: isTilt ? 48.5 : null,
      unit: isTilt ? "deg" : null,
      gps: { valid: true, lat: 10.7725 + id * 0.00005, lon: 106.6579 + id * 0.00005, age_ms: 120 },
      config_version: 1,
    },
  };
});

// Tạo sẵn 3000 điểm history (10 phút ở 5 Hz), có chèn đoạn mất GPS ở giữa cho F09
const mockHistory3000: HistoryItem[] = Array.from({ length: 3000 }, (_, i) => {
  const id = i + 1;
  const ts = new Date(Date.now() - (3000 - id) * 200).toISOString();
  const isGpsLost = id >= 1200 && id <= 1350; // Đoạn mất GPS để test tách polyline
  return {
    id,
    received_at: ts,
    time_source: "device",
    payload: {
      schema_version: 1,
      type: "telemetry",
      device_id: "vehicle_01",
      boot_id: "boot_mock_01",
      seq: id,
      uptime_ms: id * 200,
      timestamp: ts,
      clock_valid: true,
      gps: isGpsLost
        ? { valid: false, lat: null, lon: null, speed_mps: null, age_ms: 4500 }
        : {
            valid: true,
            lat: 10.7725 + Math.sin(i / 80) * 0.002 + i * 0.000003,
            lon: 106.6579 + Math.cos(i / 80) * 0.002 + i * 0.000003,
            speed_mps: 8.5,
            age_ms: 100,
          },
      imu: { valid: true, roll_deg: 2.1, pitch_deg: -1.3 },
      geofence_state: isGpsLost ? "unknown" : "inside",
      alarm_active: false,
      config_version: 1,
    },
  };
});

function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export const mockApi = {
  async getLive(
    deviceId: string,
    afterEventId: number,
    signal?: AbortSignal
  ): Promise<LiveResponse> {
    await waitWithAbort(mockControl.delayMs, signal);

    if (mockControl.scenario === "backend_error") {
      throw new Error("SERVER_UNREACHABLE");
    }

    const now = new Date().toISOString();
    if (mockControl.scenario === "no_data") {
      return {
        server_time: now,
        device_state: "no_data",
        telemetry_age_ms: null,
        last_received_at: null,
        telemetry: null,
        events: [],
        next_event_id: afterEventId,
        has_more_events: false,
        config_status: latestRequest,
        applied_config: appliedConfig,
      };
    }

    step += 1;
    seq += 1;

    const gpsInvalid = mockControl.scenario === "gps_invalid";
    const imuInvalid = mockControl.scenario === "imu_invalid";
    const deviceState =
      mockControl.scenario === "stale"
        ? "stale"
        : mockControl.scenario === "offline"
        ? "offline"
        : "online";
    const ageMs = deviceState === "stale" ? 3200 : deviceState === "offline" ? 12000 : 180;

    // Phân trang event (mỗi lần trả tối đa 20 event để dễ test has_more_events)
    const remaining = mockEvents.filter((e) => e.id > afterEventId);
    const batch = remaining.slice(0, 20);
    if (mockControl.duplicateEventsTest && batch.length > 0) {
      batch.push(batch[0]); // Cố tình chèn trùng ID để test F06
    }
    const nextEventId = batch.length > 0 ? batch[batch.length - 1].id : afterEventId;

    return {
      server_time: now,
      device_state: deviceState,
      telemetry_age_ms: ageMs,
      last_received_at: now,
      telemetry: {
        schema_version: 1,
        type: "telemetry",
        device_id: deviceId,
        boot_id: "boot_mock_01",
        seq,
        uptime_ms: step * 500,
        timestamp: now,
        clock_valid: true,
        gps: gpsInvalid
          ? { valid: false, lat: null, lon: null, speed_mps: null, age_ms: 4200 }
          : {
              valid: true,
              lat: 10.7725 + Math.sin(step / 10) * 0.0012,
              lon: 106.6579 + Math.cos(step / 10) * 0.0012,
              speed_mps: 9.72, // ~35.0 km/h
              age_ms: 150,
            },
        imu: imuInvalid
          ? { valid: false, roll_deg: null, pitch_deg: null }
          : { valid: true, roll_deg: Number((Math.sin(step) * 5).toFixed(1)), pitch_deg: 1.2 },
        geofence_state: gpsInvalid ? "unknown" : "inside",
        alarm_active: false,
        config_version: appliedConfig?.config_version ?? 0,
      },
      events: batch,
      next_event_id: nextEventId,
      has_more_events: remaining.length > 20,
      config_status: latestRequest,
      applied_config: appliedConfig,
    };
  },

  async getHistory(
    _deviceId: string,
    params: { from: string; to: string; limit: number; cursor?: string | null },
    signal?: AbortSignal
  ): Promise<PaginatedResponse<HistoryItem>> {
    await waitWithAbort(120, signal);
    const startIdx = params.cursor ? Number(params.cursor) : 0;
    const limit = Math.min(params.limit || 500, 2000);
    const items = mockHistory3000.slice(startIdx, startIdx + limit);
    const nextIdx = startIdx + items.length;
    return {
      items,
      next_cursor: nextIdx < mockHistory3000.length ? String(nextIdx) : null,
    };
  },

  async getEvents(
    _deviceId: string,
    params: { from: string; to: string; limit: number; cursor?: string | null },
    signal?: AbortSignal
  ): Promise<PaginatedResponse<EventItem>> {
    await waitWithAbort(100, signal);
    const startIdx = params.cursor ? Number(params.cursor) : 0;
    const limit = Math.min(params.limit || 500, 2000);
    const items = mockEvents.slice(startIdx, startIdx + limit);
    const nextIdx = startIdx + items.length;
    return {
      items,
      next_cursor: nextIdx < mockEvents.length ? String(nextIdx) : null,
    };
  },

  async getConfig(_deviceId: string, signal?: AbortSignal): Promise<ConfigGetResponse> {
    await waitWithAbort(80, signal);
    return { applied_config: appliedConfig, latest_request: latestRequest };
  },

  async postConfig(
    _deviceId: string,
    body: VehicleConfigBody,
    signal?: AbortSignal
  ): Promise<ConfigRequestStatus> {
    await waitWithAbort(120, signal);
    if (latestRequest?.state === "pending") {
      const err = new Error("Conflict: device already has a pending config request");
      (err as Error & { status?: number }).status = 409;
      throw err;
    }

    configVersion += 1;
    const reqId = `req_${Date.now()}`;
    pendingConfigDraft = body;
    latestRequest = { request_id: reqId, config_version: configVersion, state: "pending" };

    // Giả lập thiết bị phản hồi ACK sau 2 giây (hoặc 5.5 giây nếu timeout/applied_late)
    const outcome = mockControl.configOutcome;
    setTimeout(() => {
      if (!latestRequest || latestRequest.request_id !== reqId) return;
      if (outcome === "applied" && pendingConfigDraft) {
        appliedConfig = { ...pendingConfigDraft, config_version: configVersion };
        latestRequest = { ...latestRequest, state: "applied" };
      } else if (outcome === "rejected") {
        latestRequest = { ...latestRequest, state: "rejected", reason: "Device rejected params" };
      } else if (outcome === "timeout") {
        latestRequest = { ...latestRequest, state: "timeout", reason: "No ACK after 5s" };
      } else if (outcome === "applied_late" && pendingConfigDraft) {
        latestRequest = { ...latestRequest, state: "timeout", reason: "No ACK after 5s" };
        setTimeout(() => {
          appliedConfig = { ...pendingConfigDraft!, config_version: configVersion };
          latestRequest = { ...latestRequest!, state: "applied_late" };
        }, 2000);
      }
    }, outcome === "timeout" || outcome === "applied_late" ? 5000 : 2000);

    return latestRequest;
  },

  async getConfigRequest(
    _deviceId: string,
    requestId: string,
    signal?: AbortSignal
  ): Promise<ConfigRequestStatus> {
    await waitWithAbort(80, signal);
    if (!latestRequest || latestRequest.request_id !== requestId) {
      throw new Error("404: Request not found");
    }
    return latestRequest;
  },
};