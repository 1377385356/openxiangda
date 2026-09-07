import { randomUUID } from "node:crypto";
import {
  STUDIO_CLI_EVENT_SCHEMA_VERSION,
  type StudioCliEvent,
  type StudioCliEventType,
} from "openxiangda-contracts";

export class StudioCliEventStream {
  private sequence = 0;

  constructor(
    readonly runId: string,
    private readonly write: (event: StudioCliEvent) => void = event => {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    }
  ) {
    if (!runId || runId.length > 256) {
      throw Object.assign(
        new Error("STUDIO_RUN_ID_INVALID: runId 必须为 1 到 256 个字符"),
        { code: "STUDIO_RUN_ID_INVALID", retryable: false }
      );
    }
  }

  emit(type: StudioCliEventType, payload: Record<string, unknown>) {
    const event: StudioCliEvent = {
      schemaVersion: STUDIO_CLI_EVENT_SCHEMA_VERSION,
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
