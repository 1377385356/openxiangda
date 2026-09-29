import assert from "node:assert/strict";
import test from "node:test";
import { describePlatformTransportFailure } from "../src/platform-transport.js";

for (const [code, phase] of [["ENOTFOUND", "dns"], ["EAI_AGAIN", "dns"], ["ECONNRESET", "tcp"], ["CERT_HAS_EXPIRED", "tls"], ["ERR_TLS_CERT_ALTNAME_INVALID", "tls"], ["UND_ERR_CONNECT_TIMEOUT", "timeout"], ["SOMETHING_ELSE", "unknown"]]) {
  test(`classifies ${code} without reflecting sensitive exception text`, () => {
    const result = describePlatformTransportFailure(Object.assign(new Error("https://secret:password@private.example/?token=private"), { cause: { code } }));
    assert.equal(result.phase, phase);
    assert.ok(result.remediation.length > 10);
    assert.doesNotMatch(JSON.stringify(result), /password|private|token/);
  });
}
test("redacts malformed cause codes and does not guess missing evidence", () => {
  const result = describePlatformTransportFailure({ cause: { code: "https://user:password@proxy" } });
  assert.equal(result.phase, "unknown");
  assert.equal(result.causeCode, undefined);
});
