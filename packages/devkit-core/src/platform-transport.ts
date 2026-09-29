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
  phase: "dns" | "tcp" | "tls" | "timeout" | "unknown";
  remediation: string;
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
  const phase: PlatformTransportFailure["phase"] = timeout ? "timeout"
    : /^(ENOTFOUND|EAI_AGAIN|EAI_FAIL)$/.test(causeCode || "") ? "dns"
    : /^(ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|EPIPE|UND_ERR_SOCKET)$/.test(causeCode || "") ? "tcp"
    : /^(CERT_|ERR_TLS_|ERR_SSL_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE)/.test(causeCode || "") ? "tls"
    : "unknown";
  const remediation = {
    dns: "域名解析失败：检查校内 VPN 与 DNS 配置；重新登录不能修复 DNS。",
    tcp: "连接失败或中断：检查平台服务、VPN 路由和代理分流；若写入结果未知，先查询结果再重试。",
    tls: "TLS 证书校验失败：检查系统时间、证书链和代理证书；不要关闭证书验证。",
    timeout: "请求超时：检查 VPN、代理路由及平台健康；若写入结果未知，先查询结果再重试。",
    unknown: "连接原因尚不明确：检查目标平台、VPN 和代理；保留 requestId 排查，不要反复重新登录。",
  }[phase];
  return timeout
    ? {
        phase, remediation,
        status: 504,
        code: "OPENXIANGDA_PLATFORM_REQUEST_TIMEOUT",
        message: "OpenXiangda 平台请求在取得响应前超时",
        ...(causeCode ? { causeCode } : {}),
      }
    : {
        phase, remediation,
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
