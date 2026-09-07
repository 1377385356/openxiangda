import { Inject, Injectable } from "@nestjs/common";
import { OpenXiangdaPlatformError } from "./platform-client.js";
import { OPENXIANGDA_MODULE_OPTIONS } from "./tokens.js";
import type { OpenXiangdaModuleOptions } from "./types.js";

interface OAuthTokenResponse {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
}

interface CachedApplicationToken {
  accessToken: string;
  authorization: string;
  scope: string;
  expiresAt: number;
  refreshAt: number;
}

@Injectable()
export class OpenXiangdaApplicationCredentials {
  private readonly baseUrl: string;
  private readonly fetch: NonNullable<OpenXiangdaModuleOptions["fetch"]>;
  private cached: CachedApplicationToken | undefined;
  private inFlight: Promise<CachedApplicationToken> | undefined;

  constructor(
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    private readonly options: OpenXiangdaModuleOptions
  ) {
    this.baseUrl = options.platformBaseUrl.replace(/\/+$/, "");
    this.fetch = options.fetch || globalThis.fetch.bind(globalThis);
  }

  configured(): boolean {
    return Boolean(
      this.options.oauthClient?.clientId &&
        this.options.oauthClient?.clientSecret
    );
  }

  async getAuthorizationHeader(): Promise<string> {
    return (await this.token()).authorization;
  }

  invalidate(expectedAccessToken?: string): void {
    if (
      expectedAccessToken &&
      this.cached?.accessToken !== expectedAccessToken
    ) {
      return;
    }
    this.cached = undefined;
  }

  async withAuthorization<T>(
    operation: (authorization: string) => Promise<T>
  ): Promise<T> {
    const first = await this.token();
    try {
      return await operation(first.authorization);
    } catch (error) {
      if (!this.isUnauthorized(error)) throw error;
      this.invalidate(first.accessToken);
      const refreshed = await this.token();
      return await operation(refreshed.authorization);
    }
  }

  private async token(): Promise<CachedApplicationToken> {
    if (this.cached && Date.now() < this.cached.refreshAt) return this.cached;
    if (this.inFlight) return await this.inFlight;
    const pending = this.exchange();
    this.inFlight = pending;
    try {
      const token = await pending;
      this.cached = token;
      return token;
    } finally {
      if (this.inFlight === pending) this.inFlight = undefined;
    }
  }

  private async exchange(): Promise<CachedApplicationToken> {
    const oauth = this.options.oauthClient;
    if (!oauth?.clientId || !oauth.clientSecret) {
      throw new OpenXiangdaPlatformError(
        503,
        "APPLICATION_OAUTH_NOT_CONFIGURED",
        "OpenXiangda 应用后端尚未配置 OAuth2 Client Credentials"
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.requestTimeoutMs || 5000
    );
    try {
      const body = new URLSearchParams({ grant_type: "client_credentials" });
      const scopes = this.normalizedScopes(oauth.scopes);
      if (scopes.length) body.set("scope", scopes.join(" "));
      const basic = Buffer.from(
        `${oauth.clientId}:${oauth.clientSecret}`,
        "utf8"
      ).toString("base64");
      const response = await this.fetch(
        `${this.baseUrl}/openxiangda-api/v2/oauth2/token`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        }
      );
      let payload: OAuthTokenResponse;
      try {
        payload = (await response.json()) as OAuthTokenResponse;
      } catch {
        throw new OpenXiangdaPlatformError(
          response.status,
          "APPLICATION_OAUTH_RESPONSE_INVALID",
          "OAuth2 token endpoint 返回的不是有效 JSON"
        );
      }
      if (!response.ok || payload.error) {
        throw new OpenXiangdaPlatformError(
          response.status || 503,
          this.oauthErrorCode(payload.error),
          String(payload.error_description || "OAuth2 token 获取失败")
        );
      }
      const accessToken = String(payload.access_token || "").trim();
      const tokenType = String(payload.token_type || "").trim();
      const expiresIn = Math.floor(Number(payload.expires_in));
      if (
        !accessToken ||
        tokenType.toLowerCase() !== "bearer" ||
        !Number.isFinite(expiresIn) ||
        expiresIn < 1
      ) {
        throw new OpenXiangdaPlatformError(
          502,
          "APPLICATION_OAUTH_RESPONSE_INVALID",
          "OAuth2 token endpoint 返回了无效 token"
        );
      }
      const now = Date.now();
      const configuredSkew = Math.max(
        0,
        Math.floor(Number(oauth.refreshSkewSeconds ?? 30))
      );
      const refreshWindow = Math.min(
        configuredSkew,
        Math.max(0, Math.floor(expiresIn / 2))
      );
      return {
        accessToken,
        authorization: `Bearer ${accessToken}`,
        scope: String(payload.scope || ""),
        expiresAt: now + expiresIn * 1000,
        refreshAt: now + Math.max(1, expiresIn - refreshWindow) * 1000,
      };
    } catch (error) {
      if (error instanceof OpenXiangdaPlatformError) throw error;
      if ((error as Error)?.name === "AbortError") {
        throw new OpenXiangdaPlatformError(
          504,
          "APPLICATION_OAUTH_TIMEOUT",
          "OAuth2 token 获取超时"
        );
      }
      throw new OpenXiangdaPlatformError(
        503,
        "APPLICATION_OAUTH_UNAVAILABLE",
        (error as Error)?.message || "OAuth2 token endpoint 不可用"
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizedScopes(scopes: string[] | undefined): string[] {
    return [...new Set((scopes || []).map((scope) => scope.trim()).filter(Boolean))];
  }

  private oauthErrorCode(error: unknown): string {
    const normalized = String(error || "token_exchange_failed")
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .slice(0, 80);
    return `APPLICATION_OAUTH_${normalized || "TOKEN_EXCHANGE_FAILED"}`;
  }

  private isUnauthorized(error: unknown): boolean {
    return (
      (error instanceof OpenXiangdaPlatformError && error.httpStatus === 401) ||
      Number((error as { status?: unknown })?.status) === 401 ||
      Number((error as { statusCode?: unknown })?.statusCode) === 401
    );
  }
}
