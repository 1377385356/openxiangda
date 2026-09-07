import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type {
  RuntimeLeaseResult,
  RuntimeSecretValue,
  RuntimeSecretValues,
} from "openxiangda-contracts";
import { OpenXiangdaApplicationCredentials } from "./application-credentials.js";
import {
  OpenXiangdaPlatformClient,
  OpenXiangdaPlatformError,
} from "./platform-client.js";
import { OPENXIANGDA_MODULE_OPTIONS } from "./tokens.js";
import type { OpenXiangdaModuleOptions } from "./types.js";

export interface OpenXiangdaRuntimeLeaseState {
  active: boolean;
  holderId: string;
  leaseToken: string | null;
  expiresAt: string | null;
  lastError: string | null;
}

/**
 * Elects one replica of the exact active Native deployment for background
 * work. API handling remains available on every replica; Scheduler/Worker code
 * opts into the fence through isActive(), assertActive() or runIfActive().
 */
@Injectable()
export class OpenXiangdaRuntimeLeaseService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly holderId: string;
  private current: RuntimeLeaseResult | null = null;
  private lastError: string | null = null;
  private stopped = false;
  private terminal = false;
  private identityAccepted = false;
  private loopPromise: Promise<void> | null = null;
  private wake: (() => void) | null = null;

  constructor(
    @Inject(OpenXiangdaApplicationCredentials)
    private readonly credentials: OpenXiangdaApplicationCredentials,
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient,
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    options: OpenXiangdaModuleOptions
  ) {
    this.holderId = runtimeHolderId(options.runtimeInstanceId);
  }

  onApplicationBootstrap(): void {
    if (!this.credentials.configured() || this.loopPromise) return;
    this.loopPromise = this.loop();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    this.wake?.();
    await this.loopPromise;
  }

  isActive(): boolean {
    return Boolean(
      this.current?.granted &&
        this.current.expiresAt &&
        new Date(this.current.expiresAt).getTime() > Date.now()
    );
  }

  state(): OpenXiangdaRuntimeLeaseState {
    return {
      active: this.isActive(),
      holderId: this.holderId,
      leaseToken: this.current?.leaseToken || null,
      expiresAt: this.current?.expiresAt || null,
      lastError: this.lastError,
    };
  }

  assertActive(): void {
    if (this.isActive()) return;
    throw new OpenXiangdaPlatformError(
      503,
      "OPENXIANGDA_RUNTIME_LEASE_NOT_HELD",
      "当前实例不是后台任务活动实例"
    );
  }

  async runIfActive<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (!this.isActive()) return undefined;
    return await operation();
  }

  private async loop(): Promise<void> {
    try {
      while (!this.stopped && !this.terminal) {
        try {
          const result = await this.credentials.withAuthorization(
            authorization => {
              // Pending candidates cannot exchange an OAuth token until the
              // Head transaction activates their credential. Reaching this
              // callback proves that this exact runtime identity was accepted
              // at least once, so a later 401 means the Head moved on.
              this.identityAccepted = true;
              return this.platform.commandRuntimeLease(authorization, {
                action: this.current?.leaseToken ? "renew" : "acquire",
                holderId: this.holderId,
                ...(this.current?.leaseToken
                  ? { leaseToken: this.current.leaseToken }
                  : {}),
              });
            }
          );
          this.lastError = null;
          this.current = result.granted ? result : null;
          await this.delay(
            result.granted
              ? renewalDelay(result.expiresAt)
              : Math.max(250, result.retryAfterMs || 1000)
          );
        } catch (error) {
          this.lastError = String(
            (error as { code?: unknown })?.code ||
              (error as Error)?.message ||
              "OPENXIANGDA_RUNTIME_LEASE_UNAVAILABLE"
          );
          if (!this.current || !this.isActive()) this.current = null;
          if (runtimeIdentityEnded(error, this.identityAccepted)) {
            this.current = null;
            this.terminal = true;
            break;
          }
          await this.delay(1000);
        }
      }
    } finally {
      const leaseToken = this.current?.leaseToken;
      if (leaseToken) {
        try {
          await this.credentials.withAuthorization(authorization =>
            this.platform.commandRuntimeLease(authorization, {
              action: "release",
              holderId: this.holderId,
              leaseToken,
            })
          );
        } catch {
          // The bounded lease expires by itself if shutdown cannot reach the
          // platform or the Native Head has already moved forward.
        }
      }
      this.current = null;
    }
  }

  private async delay(milliseconds: number): Promise<void> {
    if (this.stopped) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(done, Math.max(100, milliseconds));
      const owner = this;
      function done() {
        clearTimeout(timer);
        if (owner.wake === done) owner.wake = null;
        resolve();
      }
      this.wake = done;
    });
  }
}

@Injectable()
export class OpenXiangdaRuntimeSecrets {
  private cache = new Map<string, RuntimeSecretValue>();
  private loadedAt = 0;
  private target: RuntimeSecretValues["target"] | null = null;

  constructor(
    @Inject(OpenXiangdaApplicationCredentials)
    private readonly credentials: OpenXiangdaApplicationCredentials,
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient
  ) {}

  async resolve(names?: string[]): Promise<RuntimeSecretValues> {
    const result = await this.credentials.withAuthorization(authorization =>
      this.platform.resolveRuntimeSecrets(authorization, names)
    );
    if (names === undefined) {
      this.cache.clear();
    } else {
      for (const name of names) this.cache.delete(runtimeSecretName(name));
    }
    for (const item of result.items) this.cache.set(item.name, item);
    this.loadedAt = Date.now();
    this.target = result.target;
    return result;
  }

  async get(name: string): Promise<string | undefined> {
    const normalized = runtimeSecretName(name);
    if (Date.now() - this.loadedAt > 60_000 || !this.cache.has(normalized)) {
      await this.resolve([normalized]);
    }
    return this.cache.get(normalized)?.value;
  }

  async require(name: string): Promise<string> {
    const value = await this.get(name);
    if (value !== undefined) return value;
    throw new OpenXiangdaPlatformError(
      503,
      "OPENXIANGDA_RUNTIME_SECRET_UNAVAILABLE",
      `运行时 Secret 不可用: ${name}`
    );
  }

  async environment(names?: string[]): Promise<Record<string, string>> {
    const result = await this.resolve(names);
    return Object.fromEntries(result.items.map(item => [item.env, item.value]));
  }

  async applyToProcessEnvironment(
    names?: string[],
    options: { overwrite?: boolean } = {}
  ): Promise<string[]> {
    const environment = await this.environment(names);
    const applied: string[] = [];
    for (const [name, value] of Object.entries(environment)) {
      if (options.overwrite !== true && process.env[name] !== undefined) continue;
      process.env[name] = value;
      applied.push(name);
    }
    return applied;
  }

  clear(): void {
    this.cache.clear();
    this.loadedAt = 0;
    this.target = null;
  }

  activeTarget(): RuntimeSecretValues["target"] | null {
    return this.target ? { ...this.target } : null;
  }
}

function runtimeHolderId(configured?: string): string {
  const value = String(
    configured ||
      process.env.OPENXIANGDA_RUNTIME_INSTANCE_ID ||
      process.env.HOSTNAME ||
      `process-${process.pid}`
  )
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .slice(0, 128);
  return value || `process-${process.pid}`;
}

function runtimeSecretName(value: string): string {
  const normalized = String(value || "").trim();
  if (!/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(normalized)) {
    throw new OpenXiangdaPlatformError(
      400,
      "OPENXIANGDA_RUNTIME_SECRET_NAME_INVALID",
      "运行时 Secret 名称无效"
    );
  }
  return normalized;
}

function renewalDelay(expiresAt: string | null): number {
  const remaining = expiresAt ? new Date(expiresAt).getTime() - Date.now() : 0;
  return Math.max(1000, Math.min(10_000, remaining - 10_000));
}

function runtimeIdentityEnded(
  error: unknown,
  identityAccepted: boolean
): boolean {
  const status = Number(
    (error as OpenXiangdaPlatformError)?.httpStatus ||
      (error as { status?: unknown })?.status
  );
  const code = String((error as { code?: unknown })?.code || "");
  return (
    (status === 401 && identityAccepted) ||
    code === "OPENXIANGDA_RUNTIME_LEASE_HEAD_CHANGED" ||
    code === "OPENXIANGDA_NATIVE_RUNTIME_PRINCIPAL_REQUIRED"
  );
}
