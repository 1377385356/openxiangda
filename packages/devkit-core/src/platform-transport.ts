import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CAUSE_CODE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export interface PlatformRequestDiagnostic {
  requestId: string;
  method: string;
  path: string;
}

export interface PlatformTransportFailure {
  status: 503 | 504;
  code:
    | "OPENXIANGDA_PLATFORM_REQUEST_TIMEOUT"
    | "OPENXIANGDA_PLATFORM_TRANSPORT_FAILED";
  message: string;
  causeCode?: string;
}

export function preparePlatformRequest(
  path: string,
  init: RequestInit = {}
) {
  const headers = new Headers(init.headers);
  const suppliedRequestId = headers.get("X-Request-ID");
  const requestId =
    suppliedRequestId && REQUEST_ID_PATTERN.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
  headers.set("X-Request-ID", requestId);
  return {
    headers,
    diagnostic: {
      requestId,
      method: String(init.method || "GET").toUpperCase(),
      path: sanitizedPlatformPath(path),
    } satisfies PlatformRequestDiagnostic,
  };
}

export function describePlatformTransportFailure(
  error: unknown
): PlatformTransportFailure {
  const rawCauseCode = String(
    (error as { cause?: { code?: unknown } })?.cause?.code ||
      (error as { code?: unknown })?.code ||
      ""
  ).trim();
  const causeCode = CAUSE_CODE_PATTERN.test(rawCauseCode)
    ? rawCauseCode
    : undefined;
  const timeout =
    ["AbortError", "TimeoutError"].includes(
      String((error as { name?: unknown })?.name || "")
    ) || /TIMEOUT/i.test(causeCode || "");
  return timeout
    ? {
        status: 504,
        code: "OPENXIANGDA_PLATFORM_REQUEST_TIMEOUT",
        message: "OpenXiangda 平台请求在取得响应前超时",
        ...(causeCode ? { causeCode } : {}),
      }
    : {
        status: 503,
        code: "OPENXIANGDA_PLATFORM_TRANSPORT_FAILED",
        message: "OpenXiangda 平台请求在取得响应前连接失败",
        ...(causeCode ? { causeCode } : {}),
      };
}

function sanitizedPlatformPath(path: string) {
  const value = String(path || "").split("?", 1)[0] || "/";
  return value.startsWith("/") ? value : `/${value}`;
}
