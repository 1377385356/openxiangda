import { randomUUID } from "node:crypto";
import {
  CLI_EVENT_SCHEMA_VERSION,
  type CliEvent,
  type CliEventType,
} from "openxiangda-contracts";

export class CliEventStream {
  private sequence = 0;

  constructor(
    readonly runId: string,
    private readonly write: (event: CliEvent) => void = event => {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    }
  ) {
    if (!runId || runId.length > 256) {
      throw Object.assign(
        new Error("CLI_RUN_ID_INVALID: runId 必须为 1 到 256 个字符"),
        { code: "CLI_RUN_ID_INVALID", retryable: false }
      );
    }
  }

  emit(type: CliEventType, payload: Record<string, unknown>) {
    const event: CliEvent = {
      schemaVersion: CLI_EVENT_SCHEMA_VERSION,
      eventId: randomUUID(),
      runId: this.runId,
      seq: ++this.sequence,
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.write(event);
    return event;
  }
}
