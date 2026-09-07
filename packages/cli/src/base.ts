import { developerError } from 'openxiangda-devkit-core';
import { Command, Flags } from "@oclif/core";
import { randomUUID } from "node:crypto";
import {
  STUDIO_CLI_RESULT_SCHEMA_VERSION,
  type DevkitResult,
} from "openxiangda-contracts";
import {
  OpenXiangdaApplicationServices,
  commandDefinition,
  type OperationProgress,
} from "openxiangda-devkit-core";
import { StudioCliEventStream } from "./studio-events.js";
import { resolveCliToolchainCapsule } from "./toolchain-capsule.js";

export const workspaceFlags = {
  cwd: Flags.string({ summary: "应用工作区目录", helpValue: "<directory>" }),
};

export const studioEventFlags = {
  "json-events": Flags.boolean({
    summary: "按 openxiangda.cli-event/v1 输出 JSONL 事件",
    exclusive: ["json"],
  }),
  "run-id": Flags.string({
    summary: "Studio AgentRun ID；仅与 --json-events 一起使用",
    helpValue: "<run-id>",
    dependsOn: ["json-events"],
    parse: async input => {
      if (!input || input.length > 256) {
        throw Object.assign(
          new Error("STUDIO_RUN_ID_INVALID: runId 必须为 1 到 256 个字符"),
          { code: "STUDIO_RUN_ID_INVALID", retryable: false }
        );
      }
      return input;
    },
  }),
};

export const studioWorkspaceFlags = {
  ...workspaceFlags,
  ...studioEventFlags,
};

export abstract class OpenXiangdaCommand extends Command {
  static enableJsonFlag = true;

  protected readonly services = new OpenXiangdaApplicationServices({
    toolchainCapsule: resolveCliToolchainCapsule(),
  });
  private studioEventStream?: StudioCliEventStream;
  private studioEventStarted = false;

  protected async catch(error: Error & { exitCode?: number }) {
    process.exitCode = error.exitCode ?? 1;
    if (this.studioEventsEnabled()) {
      this.beginStudioEvents();
      this.studioEventStream!.emit("command.failed", {
        operation: this.id || "unknown",
        result: this.toErrorJson(error),
      });
      return;
    }
    if (this.jsonEnabled()) {
      this.logJson(this.toErrorJson(error));
      return;
    }
    throw error;
  }

  protected present(result: DevkitResult<unknown>) {
    if (!result.ok) process.exitCode = 1;
    if (this.studioEventsEnabled()) {
      this.beginStudioEvents(result.operation);
      const envelope = this.envelope(result);
      this.studioEventStream!.emit(
        result.ok ? "command.completed" : "command.failed",
        { operation: result.operation, result: envelope }
      );
      return;
    }
    if (this.jsonEnabled()) return this.envelope(result);
    this.log(`${result.ok ? "✓" : "✗"} ${result.operation}`);
    for (const diagnostic of result.diagnostics) {
      this.log(`  ${diagnostic.code}: ${diagnostic.message}`);
      if (diagnostic.remediation) this.log(`  → ${diagnostic.remediation}`);
    }
    if (result.data !== undefined) {
      this.log(JSON.stringify(result.data, null, 2));
    }
    return result;
  }

  protected machineOutputEnabled() {
    return this.jsonEnabled() || this.studioEventsEnabled();
  }

  protected beginStudioEvents(operation = this.id || "unknown") {
    if (!this.studioEventsEnabled()) return;
    if (!this.studioEventStream) {
      this.studioEventStream = new StudioCliEventStream(
        this.studioRunId() || randomUUID()
      );
    }
    if (!this.studioEventStarted) {
      this.studioEventStarted = true;
      this.studioEventStream.emit("command.started", { operation });
    }
  }

  protected emitStudioStatus(
    message: string,
    details: Record<string, unknown> = {}
  ) {
    if (!this.studioEventsEnabled()) return;
    this.beginStudioEvents();
    this.studioEventStream!.emit("command.status", {
      operation: this.id || "unknown",
      message,
      ...details,
    });
  }

  protected presentOperationProgress(event: OperationProgress) {
    const state = { running: '进行中', passed: '完成', failed: '失败', skipped: '未执行' }[event.state];
    const message = `${event.label}：${state}，${(event.durationMs / 1000).toFixed(1)} 秒`;
    if (this.studioEventsEnabled()) this.emitStudioStatus(message, { progress: event });
    else process.stderr.write(`${message}\n`);
  }

  protected toErrorJson(error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error || "未知错误");
    const code = String(
      (error as { code?: unknown })?.code ||
        message.match(/^([A-Z][A-Z0-9_]+)/)?.[1] ||
        "OPENXIANGDA_COMMAND_FAILED"
    );
    const nextCommand = this.errorNextCommand(code);
    return {
      schemaVersion: STUDIO_CLI_RESULT_SCHEMA_VERSION,
      ok: false,
      operation: this.id || "unknown",
      workspace: null,
      data: null,
      error: developerError(error, nextCommand),
    };
  }

  private envelope(result: DevkitResult<unknown>) {
    const diagnostic = result.diagnostics.find(item => item.severity === "error");
    const nextCommand =
      result.nextActions.find(action => action.command?.startsWith("openxiangda "))
        ?.command || (diagnostic ? this.errorNextCommand(diagnostic.code) : null);
    const studioInitialization =
      result.data &&
      typeof result.data === "object" &&
      "studioInitialization" in result.data;
    return {
      schemaVersion: STUDIO_CLI_RESULT_SCHEMA_VERSION,
      ok: result.ok,
      operation: result.operation,
      workspace: studioInitialization
        ? {
            appCode: result.workspace.appCode,
            name: result.workspace.name,
          }
        : result.workspace,
      data: result.data ?? null,
      error: diagnostic
        ? {
            code: diagnostic.code,
            message: diagnostic.message,
            retryable: diagnostic.retryable,
            remediation:
              diagnostic.remediation ||
              (nextCommand ? `运行 ${nextCommand}` : "检查错误后重试"),
            nextCommand,
            ...(diagnostic.path ? { pointer: diagnostic.path } : {}),
            ...(diagnostic.details ? { details: diagnostic.details } : {}),
          }
        : null,
    };
  }

  private studioEventsEnabled() {
    if (!this.argv.includes("--json-events")) return false;
    const command = commandDefinition(this.id || "");
    return Boolean(
      command &&
        "studioJsonEvents" in command &&
        command.studioJsonEvents === true
    );
  }

  private studioRunId() {
    const inline = this.argv.find(argument => argument.startsWith("--run-id="));
    if (inline) {
      const value = inline.slice("--run-id=".length);
      return value && value.length <= 256 ? value : undefined;
    }
    const index = this.argv.indexOf("--run-id");
    const value = index >= 0 ? this.argv[index + 1] : undefined;
    return value && value.length <= 256 ? value : undefined;
  }

  private errorNextCommand(code: string) {
    if (/AUTH|LOGIN|SESSION|TOKEN/.test(code)) {
      return "openxiangda login --base-url <platform>";
    }
    if (/PRODUCTION|PROMOTION/.test(code)) {
      return "openxiangda deploy --environment production --from <test-deployment-id>";
    }
    if (code === "DELIVERY_RUN_ALREADY_ACTIVE") {
      return "openxiangda status";
    }
    const currentCommand: Record<string, string> = {
      admin: "openxiangda admin context --json",
      create: "openxiangda create <directory> --base-url <platform>",
      dev: "openxiangda dev",
      check: "openxiangda check",
      accept: "openxiangda accept --plan <file>",
      deploy: "openxiangda deploy",
      status: "openxiangda status",
      logs: "openxiangda logs",
      cancel: "openxiangda cancel <deployment-id>",
      retry: "openxiangda retry <deployment-id>",
      start: "openxiangda start",
      stop: "openxiangda stop",
      rollback: "openxiangda rollback --to <app-version-id>",
      login: "openxiangda login --base-url <platform>",
      spec: "openxiangda spec context --json",
    };
    const currentId = this.id;
    if (currentId && currentCommand[currentId]) return currentCommand[currentId]!;
    if (/LINK|WORKSPACE|APP_CODE|APP_NAME|TARGET_DIRECTORY/.test(code)) {
      return "openxiangda create <directory> --base-url <platform>";
    }
    if (/DEPLOYMENT|STATUS|LOG/.test(code)) return "openxiangda status";
    if (/APPSPEC/.test(code)) return "openxiangda spec check";
    if (/DEV/.test(code)) return "openxiangda dev";
    return "openxiangda check";
  }
}
