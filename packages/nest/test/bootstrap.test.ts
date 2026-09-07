import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Controller, Module, Post, Req } from "@nestjs/common";
import { bootstrapOpenXiangdaApplication } from "../src/index.js";

interface RequestWithRawBody {
  body: unknown;
  rawBody?: Buffer;
}

class RawBodyController {
  inspect(request: RequestWithRawBody) {
    return {
      body: request.body,
      rawBody: request.rawBody?.toString('utf8') ?? null,
    };
  }
}

class RawBodyModule {}

Req()(RawBodyController.prototype, "inspect", 0);
Post("raw-body")(
  RawBodyController.prototype,
  "inspect",
  Object.getOwnPropertyDescriptor(RawBodyController.prototype, "inspect")!
);
Controller()(RawBodyController);
Module({ controllers: [RawBodyController] })(RawBodyModule);

test("the canonical bootstrap rejects unknown legacy runtime options", async () => {
  await assert.rejects(
    () =>
      bootstrapOpenXiangdaApplication(RawBodyModule, {
        appCode: "manual-app",
      } as any),
    /OPENXIANGDA_BOOTSTRAP_OPTION_UNKNOWN:appCode/
  );
  await assert.rejects(
    () => bootstrapOpenXiangdaApplication(RawBodyModule, null as any),
    /OPENXIANGDA_BOOTSTRAP_OPTIONS_OBJECT_REQUIRED/
  );
});

test("the canonical bootstrap preserves the exact JSON request bytes", async () => {
  const app = await bootstrapOpenXiangdaApplication(RawBodyModule, {
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const address = app.getHttpServer().address() as
      | { port: number }
      | string
      | null;
    assert.ok(address && typeof address === "object");
    const rawBody = '{"visitor":"蔡杰", "purpose":"验收"}';
    const response = await fetch(`http://127.0.0.1:${address.port}/raw-body`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      body: { visitor: "蔡杰", purpose: "验收" },
      rawBody,
    });
  } finally {
    await app.close();
  }
});

test("the canonical bootstrap parses structured CloudEvents and preserves their exact bytes", async () => {
  const app = await bootstrapOpenXiangdaApplication(RawBodyModule, {
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const address = app.getHttpServer().address() as
      | { port: number }
      | string
      | null;
    assert.ok(address && typeof address === "object");
    const rawBody =
      '{"specversion":"1.0", "id":"event-1", "type":"reference.event.v1"}';
    const response = await fetch(`http://127.0.0.1:${address.port}/raw-body`, {
      method: "POST",
      headers: {
        "content-type": "application/cloudevents+json; charset=utf-8",
      },
      body: rawBody,
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      body: {
        specversion: "1.0",
        id: "event-1",
        type: "reference.event.v1",
      },
      rawBody,
    });
  } finally {
    await app.close();
  }
});
