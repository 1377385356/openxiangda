import assert from "node:assert/strict";
import test from "node:test";
import type { ApplicationAdministrationContext } from "openxiangda-contracts";
import { OpenXiangdaControlPlaneClient } from "../src/control-plane-client.js";

test("reads administration context and effective workflow parameters through the scoped authenticated client", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: "https://platform.example/service", token: "fixture-token",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ code: 200, data: { effect: "future_node_entries_keep_existing_tasks" } }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  await client.applicationAdministrationContext("app code", "preproduction");
  const result = await client.workflowNodeConfigurations("app code", "review/finance", "production");
  assert.equal(result.effect, "future_node_entries_keep_existing_tasks");
  assert.deepEqual(requests.map(request => request.url), [
    "https://platform.example/service/openxiangda-api/v2/applications/app%20code/admin/context?environmentKey=preproduction",
    "https://platform.example/service/openxiangda-api/v2/applications/app%20code/admin/workflows/review%2Ffinance/node-configurations?environmentKey=production",
  ]);
  for (const request of requests) {
    assert.equal(request.init?.method || "GET", "GET");
    assert.equal(request.init?.body, undefined);
    assert.equal(new Headers(request.init?.headers).get("Authorization"), "Bearer fixture-token");
  }
});

test("does not represent a forbidden remote response as an empty configuration", async () => {
  const client = new OpenXiangdaControlPlaneClient({ baseUrl: "https://platform.example/service", token: "fixture-token",
    fetch: async () => new Response(JSON.stringify({ code: 403, message: "SUPER_ADMIN_REQUIRED" }), { status: 403, headers: { "Content-Type": "application/json" } }),
  });
  await assert.rejects(client.workflowNodeConfigurations("app", "review", "production"), /SUPER_ADMIN_REQUIRED/);
});

test("keeps delegated and unpublished administration authority instead of manufacturing a super-admin head", async () => {
  for (const access of [
    { authorization: "delegated_role_manager" as const, authorizedPages: ["roles" as const], appVersionId: "version-1", headRevision: 4 },
    { authorization: "application_management" as const, authorizedPages: ["versions" as const], unpublished: true, appVersionId: null, headRevision: null },
  ]) {
    const context: ApplicationAdministrationContext = {
      schemaVersion: "openxiangda.application-admin-context/v2", appCode: "app", environmentKey: "preproduction",
      environmentId: "test", userId: "user", capabilities: { roleMembers: access.authorization === "delegated_role_manager" },
      limits: { atomicOperations: 100, requestBytes: 1048576 }, ...access,
    };
    const client = new OpenXiangdaControlPlaneClient({ baseUrl: "https://platform.example/service", token: "fixture-token",
      fetch: async () => new Response(JSON.stringify({ code: 200, data: context }), { headers: { "Content-Type": "application/json" } }),
    });
    assert.deepEqual(await client.applicationAdministrationContext("app", "preproduction"), context);
  }
});
