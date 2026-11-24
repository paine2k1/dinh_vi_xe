import { APP_CONFIG } from "../config/env";
import { mockApi } from "../mocks/mockApi";
import type {
  ApiErrorEnvelope,
  ConfigGetResponse,
  ConfigRequestStatus,
  EventItem,
  HistoryItem,
  LiveResponse,
  PaginatedResponse,
  VehicleConfigBody,
} from "../types/telemetry";

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let body: ApiErrorEnvelope | null = null;
    try {
      body = (await res.json()) as ApiErrorEnvelope;
    } catch {
      // ignore parse error
    }
    throw new ApiError(
      res.status,
      body?.error?.code || `HTTP_${res.status}`,
      body?.error?.message || res.statusText,
      body?.error?.fields
    );
  }

  return (await res.json()) as T;
}

const isMock = () => APP_CONFIG.dataSourceMode === "MOCK";
const base = () => APP_CONFIG.apiBaseUrl;

export const apiClient = {
  getLive(deviceId: string, afterEventId: number, signal?: AbortSignal): Promise<LiveResponse> {
    if (isMock()) return mockApi.getLive(deviceId, afterEventId, signal);
    const qs = new URLSearchParams({ after_event_id: String(afterEventId) });
    return fetchJson<LiveResponse>(`${base()}/vehicles/${encodeURIComponent(deviceId)}/live?${qs}`, {
      signal,
    });
  },

  getHistory(
    deviceId: string,
    params: { from: string; to: string; limit: number; cursor?: string | null },
    signal?: AbortSignal
  ): Promise<PaginatedResponse<HistoryItem>> {
    if (isMock()) return mockApi.getHistory(deviceId, params, signal);
    const qs = new URLSearchParams({
      from: params.from,
      to: params.to,
      limit: String(params.limit),
    });
    if (params.cursor) qs.set("cursor", params.cursor);
    return fetchJson<PaginatedResponse<HistoryItem>>(
      `${base()}/vehicles/${encodeURIComponent(deviceId)}/history?${qs}`,
      { signal }
    );
  },

  getEvents(
    deviceId: string,
    params: { from: string; to: string; limit: number; cursor?: string | null },
    signal?: AbortSignal
  ): Promise<PaginatedResponse<EventItem>> {
    if (isMock()) return mockApi.getEvents(deviceId, params, signal);
    const qs = new URLSearchParams({
      from: params.from,
      to: params.to,
      limit: String(params.limit),
    });
    if (params.cursor) qs.set("cursor", params.cursor);
    return fetchJson<PaginatedResponse<EventItem>>(
      `${base()}/vehicles/${encodeURIComponent(deviceId)}/events?${qs}`,
      { signal }
    );
  },

  getConfig(deviceId: string, signal?: AbortSignal): Promise<ConfigGetResponse> {
    if (isMock()) return mockApi.getConfig(deviceId, signal);
    return fetchJson<ConfigGetResponse>(
      `${base()}/vehicles/${encodeURIComponent(deviceId)}/config`,
      { signal }
    );
  },

  postConfig(
    deviceId: string,
    body: VehicleConfigBody,
    signal?: AbortSignal
  ): Promise<ConfigRequestStatus> {
    if (isMock()) return mockApi.postConfig(deviceId, body, signal);
    return fetchJson<ConfigRequestStatus>(
      `${base()}/vehicles/${encodeURIComponent(deviceId)}/config`,
      {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      }
    );
  },

  getConfigRequest(
    deviceId: string,
    requestId: string,
    signal?: AbortSignal
  ): Promise<ConfigRequestStatus> {
    if (isMock()) return mockApi.getConfigRequest(deviceId, requestId, signal);
    return fetchJson<ConfigRequestStatus>(
      `${base()}/vehicles/${encodeURIComponent(deviceId)}/config/requests/${encodeURIComponent(requestId)}`,
      { signal }
    );
  },
};