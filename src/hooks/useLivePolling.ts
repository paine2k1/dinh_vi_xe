import { useEffect, useRef, useState } from "react";
import { APP_CONFIG } from "../config/env";
import { ApiError, apiClient } from "../services/apiClient";
import type { EventItem, LiveResponse } from "../types/telemetry";

export type BackendStatus = "connecting" | "connected" | "server_unreachable";

export interface LastKnownPosition {
  lat: number;
  lon: number;
  updatedAt: string | null;
}

export interface LivePollingState {
  backendStatus: BackendStatus;
  backendError: string | null;
  liveData: LiveResponse | null;
  events: EventItem[];
  lastKnownPosition: LastKnownPosition | null;
  isStaleFromServerError: boolean;
}

const INITIAL_STATE: LivePollingState = {
  backendStatus: "connecting",
  backendError: null,
  liveData: null,
  events: [],
  lastKnownPosition: null,
  isStaleFromServerError: false,
};

function mergeUniqueEvents(
  prev: EventItem[],
  incoming: EventItem[],
  maxItems: number
): EventItem[] {
  if (incoming.length === 0) return prev;

  const byId = new Map<number, EventItem>();
  for (const ev of prev) byId.set(ev.id, ev);
  for (const ev of incoming) byId.set(ev.id, ev);

  // Giữ thứ tự mới nhất lên đầu (hoặc id tăng dần tùy UI, ở đây sort giảm dần theo id)
  const merged = Array.from(byId.values()).sort((a, b) => b.id - a.id);
  return merged.slice(0, maxItems);
}

export function useLivePolling(deviceId: string): LivePollingState {
  const [state, setState] = useState<LivePollingState>(INITIAL_STATE);

  // Cursor độc lập cho event; chỉ cập nhật sau khi nhận/lưu response hợp lệ
  const afterEventIdRef = useRef<number>(0);
  // Giữ AbortController của request đang bay để chống chồng & hủy khi đổi xe/unmount
  const inFlightControllerRef = useRef<AbortController | null>(null);
  const timerIdRef = useRef<number | null>(null);

  useEffect(() => {
    let isActive = true;

    // Reset state và cursor khi đổi device_id
    afterEventIdRef.current = 0;
    setState(INITIAL_STATE);

    const stopTimer = () => {
      if (timerIdRef.current !== null) {
        window.clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
    };

    const abortInFlight = () => {
      if (inFlightControllerRef.current) {
        inFlightControllerRef.current.abort();
        inFlightControllerRef.current = null;
      }
    };

    const fetchOnce = async () => {
      // Chỉ chạy khi tab đang ở foreground
      if (!isActive || document.visibilityState !== "visible") return;

      // F01 & F02: Nếu request trước chưa xong -> bỏ tick này, không xếp hàng gửi dồn
      if (inFlightControllerRef.current !== null) return;

      const controller = new AbortController();
      inFlightControllerRef.current = controller;
      let didTimeout = false;

      const timeoutId = window.setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, APP_CONFIG.liveTimeoutMs);

      try {
        const res = await apiClient.getLive(
          deviceId,
          afterEventIdRef.current,
          controller.signal
        );

        if (!isActive) return;

        // Cập nhật cursor sau khi nhận response hợp lệ
        afterEventIdRef.current = res.next_event_id;

        setState((prev) => {
          // Cập nhật vị trí cuối đã biết nếu GPS hợp lệ và age_ms <= 3000
          let nextLastKnown = prev.lastKnownPosition;
          const gps = res.telemetry?.gps;
          if (
            gps &&
            gps.valid &&
            gps.lat !== null &&
            gps.lon !== null &&
            (gps.age_ms === null || gps.age_ms <= 3000)
          ) {
            nextLastKnown = {
              lat: gps.lat,
              lon: gps.lon,
              updatedAt: res.telemetry?.timestamp ?? res.last_received_at,
            };
          }

          return {
            backendStatus: "connected",
            backendError: null,
            liveData: res,
            events: mergeUniqueEvents(
              prev.events,
              res.events,
              APP_CONFIG.maxLiveEvents
            ),
            lastKnownPosition: nextLastKnown,
            isStaleFromServerError: false,
          };
        });
      } catch (err) {
        if (!isActive) return;

        // Nếu bị hủy chủ động (đổi xe / unmount) và không phải timeout -> bỏ qua
        const isAbort =
          err instanceof DOMException && err.name === "AbortError";
        if (isAbort && !didTimeout) return;

        const isServerError =
          didTimeout ||
          !(err instanceof ApiError) ||
          err.status >= 500 ||
          err.status === 0;

        const message = didTimeout
          ? `Timeout sau ${APP_CONFIG.liveTimeoutMs} ms`
          : err instanceof Error
          ? err.message
          : "Không thể kết nối server";

        // F10: Giữ nguyên dữ liệu cũ & cursor, chỉ đánh dấu mất kết nối server
        setState((prev) => ({
          ...prev,
          backendStatus: isServerError ? "server_unreachable" : prev.backendStatus,
          backendError: message,
          isStaleFromServerError: prev.liveData !== null,
        }));
      } finally {
        window.clearTimeout(timeoutId);
        if (inFlightControllerRef.current === controller) {
          inFlightControllerRef.current = null;
        }
      }
    };

    const startPolling = () => {
      stopTimer();
      // Gọi ngay lập tức khi mở trang hoặc khi tab quay lại foreground
      void fetchOnce();
      timerIdRef.current = window.setInterval(() => {
        void fetchOnce();
      }, APP_CONFIG.livePollIntervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Tab về foreground: gọi ngay với cursor cũ rồi tiếp tục 500 ms
        startPolling();
      } else {
        // Tab ra nền: dừng timer để không poll lãng phí
        stopTimer();
      }
    };

    if (document.visibilityState === "visible") {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      stopTimer();
      abortInFlight();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [deviceId]);

  return state;
}