import assert from "node:assert/strict";
import test from "node:test";
import { resolveDockerPublishedPort } from "../lib/docker-published-port.mjs";

test("uses the direct docker port output when available", () => {
  const calls = [];
  const port = resolveDockerPublishedPort((command, args) => {
    calls.push([command, args]);
    return "127.0.0.1:43123\n";
  }, "registry", "4873/tcp");

  assert.equal(port, "43123");
  assert.equal(calls.length, 1);
});

test("falls back to Docker inspect when docker port is temporarily empty", () => {
  const port = resolveDockerPublishedPort((command, args) => {
    assert.equal(command, "docker");
    if (args[0] === "port") return "";
    return JSON.stringify({
      "4873/tcp": [{ HostIp: "127.0.0.1", HostPort: "49152" }],
    });
  }, "registry", "4873/tcp");

  assert.equal(port, "49152");
});

test("rejects missing and invalid published ports", () => {
  assert.equal(
    resolveDockerPublishedPort(
      (_command, args) =>
        args[0] === "port"
          ? ""
          : JSON.stringify({ "4873/tcp": [{ HostPort: "70000" }] }),
      "registry",
      "4873/tcp"
    ),
    null
  );
});
