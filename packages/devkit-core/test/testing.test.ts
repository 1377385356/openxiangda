import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  SCHEMA_VERSIONS,
  eventDeliverySignatureContentV2,
  sha256Digest,
} from "openxiangda-contracts";
import {
  PermissionMatrixError,
  assertPermissionMatrix,
  currentUserFixture,
  dataRecordEventFixture,
  eventMatchesSubscription,
  runPermissionMatrix,
  signedEventDeliveryFixture,
  simulateEventSubscription,
} from "../src/testing.js";

test("builds deterministic current-user role unions", () => {
  assert.deepEqual(
    currentUserFixture({
      roleCodes: ["instrument_admin", "college_admin", "instrument_admin"],
      capabilityCodes: ["instruments:update", "instruments:read"],
    }),
    {
      userId: "user-test",
      appCode: "reference-app",
      environmentKey: "preproduction",
      roleCodes: ["college_admin", "instrument_admin"],
      capabilityCodes: ["instruments:read", "instruments:update"],
      isAppSuperAdmin: false,
    }
  );
});

test("builds bounded canonical data v2 fixtures and evaluates subscription filters", () => {
  const event = dataRecordEventFixture({
    changedFields: ["status", "ownerId"],
    changes: {
      status: { before: "normal", after: "maintenance" },
      ownerId: { before: "user-1", after: "user-2" },
    },
    projection: { code: "INS-001", name: "质谱仪", secret: "not-selected" },
  });
  const filter = {
    resourceCodes: ["instruments"],
    changedFields: { allOf: ["status"], noneOf: ["deletedAt"] },
    changes: [{ field: "status", after: { in: ["maintenance", "disabled"] } }],
  } as const;
  assert.equal(event.type, "openxiangda.data.record.updated.v2");
  assert.equal(eventMatchesSubscription(event, filter), true);
  assert.equal(
    eventMatchesSubscription(event, {
      ...filter,
      changes: [{ field: "status", after: { eq: "normal" } }],
    }),
    false
  );
  const result = simulateEventSubscription(event, {
    filter,
    payload: { includeChanges: false, fields: ["code", "name"] },
  });
  assert.equal(result.matched, true);
  assert.deepEqual(result.event?.data.changes, {});
  assert.deepEqual(result.event?.data.projection, {
    code: "INS-001",
    name: "质谱仪",
  });
});

test("builds a canonical signed v2 delivery fixture bound to the handler manifest", () => {
  const event = dataRecordEventFixture({ eventId: "event-signed-fixture" });
  const manifest = {
    schemaVersion: SCHEMA_VERSIONS.eventHandlerManifest,
    appCode: "reference-app",
    handlers: [
      {
        code: "instrument-events",
        endpointPath: "/__platform/events/instrument-events",
        eventTypes: ["openxiangda.data.record.updated.v2"],
        dataSchemaVersions: ["2.0.0"],
        maxBodyBytes: 65_536,
        receiptProtocolVersion: 2,
      },
    ],
  } as const;
  const delivery = signedEventDeliveryFixture({
    event,
    subscriptionCode: "instrument-events",
    deliveryId: "delivery-signed-fixture",
    signingSecret: "fixture-secret",
    signingKeyVersion: 3,
    handlerManifest: manifest,
    timestamp: 1_787_538_400,
  });
  const expected = createHmac("sha256", "fixture-secret")
    .update(
      eventDeliverySignatureContentV2({
        timestamp: "1787538400",
        signingKeyVersion: "3",
        deliveryId: "delivery-signed-fixture",
        eventId: event.id,
        subscriptionCode: "instrument-events",
        handlerManifestDigest: sha256Digest(manifest),
        rawBody: delivery.rawBody,
      })
    )
    .digest("hex");

  assert.equal(delivery.handlerManifestDigest, sha256Digest(manifest));
  assert.equal(delivery.headers["x-openxiangda-signature"], `v2=${expected}`);
  assert.equal(
    delivery.headers["x-openxiangda-handler-manifest-digest"],
    delivery.handlerManifestDigest
  );
});

test("evaluates a CRUD permission matrix through the caller-owned authorizer", async () => {
  const currentUser = currentUserFixture({
    capabilityCodes: ["instruments:read", "instruments:update"],
  });
  const cases = [
    { name: "read", currentUser, operation: "read", expected: "allow" },
    { name: "delete", currentUser, operation: "delete", expected: "deny" },
  ] as const;
  const results = await runPermissionMatrix([...cases], testCase =>
    testCase.currentUser.capabilityCodes.includes(
      `instruments:${testCase.operation}`
    )
  );
  assert.deepEqual(
    results.map(result => result.passed),
    [true, true]
  );
  await assert.rejects(
    () => assertPermissionMatrix([...cases], () => false),
    (error: unknown) => {
      assert.ok(error instanceof PermissionMatrixError);
      assert.equal(error.results.filter(result => !result.passed).length, 1);
      return true;
    }
  );
});
