import assert from "node:assert/strict";
import test from "node:test";
import {
  isSupersededPrepublicationReceipt,
  isSupersededReferencePrepublicationReceipt,
  releaseInvocationAction,
  releasePublicationHasStarted,
  supersededCandidateArtifactIsCompatible,
} from "../lib/release-receipt-state.mjs";

const referenceEvidence = {
  head: "c".repeat(40),
  packageJsonSha256: "d".repeat(64),
  pnpmLockSha256: "e".repeat(64),
};

test("a superseded prepublication receipt can be rebuilt from the new commit", () => {
  for (const phase of ["planned", "validated"]) {
    assert.equal(
      isSupersededPrepublicationReceipt(
        { head: "a".repeat(40), phase },
        "b".repeat(40)
      ),
      true
    );
    assert.equal(releasePublicationHasStarted({ phase }), false);
  }
});

test("a release that may have written registry state never crosses commits", () => {
  for (const phase of [
    "publishing-packages",
    "packages-published",
    "dist-tags-synchronized",
    "complete",
  ]) {
    assert.equal(
      isSupersededPrepublicationReceipt(
        { head: "a".repeat(40), phase },
        "b".repeat(40)
      ),
      false
    );
    assert.equal(releasePublicationHasStarted({ phase }), true);
  }
});

test("the current commit keeps its existing receipt", () => {
  const head = "a".repeat(40);
  assert.equal(
    isSupersededPrepublicationReceipt({ head, phase: "planned" }, head),
    false
  );
});

test("a changed reference application supersedes only a prepublication receipt", () => {
  for (const field of ["head", "packageJsonSha256", "pnpmLockSha256"]) {
    const changed = { ...referenceEvidence, [field]: "f".repeat(field === "head" ? 40 : 64) };
    for (const phase of ["planned", "validated"]) {
      assert.equal(
        isSupersededReferencePrepublicationReceipt(
          { phase, referenceApplication: referenceEvidence },
          changed
        ),
        true
      );
    }
    assert.equal(
      isSupersededReferencePrepublicationReceipt(
        { phase: "publishing-packages", referenceApplication: referenceEvidence },
        changed
      ),
      false
    );
  }
  assert.equal(
    isSupersededReferencePrepublicationReceipt(
      { phase: "planned", referenceApplication: referenceEvidence },
      referenceEvidence
    ),
    false
  );
});

test("verification prepares or reuses a validated receipt", () => {
  assert.equal(
    releaseInvocationAction(null, { validateOnly: true }),
    "validate"
  );
  assert.equal(
    releaseInvocationAction({ phase: "planned" }, { validateOnly: true }),
    "validate"
  );
  assert.equal(
    releaseInvocationAction({ phase: "validated" }, { validateOnly: true }),
    "verified"
  );
});

test("publication requires validation and resumes only publication phases", () => {
  assert.throws(
    () => releaseInvocationAction(null),
    /verify:release command first/
  );
  assert.throws(
    () => releaseInvocationAction({ phase: "planned" }),
    /verify:release command first/
  );
  assert.equal(releaseInvocationAction({ phase: "validated" }), "publish");
  for (const phase of [
    "publishing-packages",
    "packages-published",
    "dist-tags-synchronized",
    "complete",
  ]) {
    assert.equal(releaseInvocationAction({ phase }), "resume");
    assert.throws(
      () => releaseInvocationAction({ phase }, { validateOnly: true }),
      /publication has already started/
    );
  }
});

test("unknown receipt phases fail closed", () => {
  assert.throws(
    () => releaseInvocationAction({ phase: "mystery" }),
    /Unsupported release receipt phase/
  );
  assert.throws(
    () => releaseInvocationAction({ phase: "mystery" }, { validateOnly: true }),
    /Unsupported release receipt phase/
  );
});

test("superseded prepublication artifacts accept only equal published bytes", () => {
  assert.equal(
    supersededCandidateArtifactIsCompatible({
      published: false,
      expectedIntegrity: "sha512-expected",
      actualIntegrity: null,
    }),
    true
  );
  assert.equal(
    supersededCandidateArtifactIsCompatible({
      published: true,
      expectedIntegrity: "sha512-expected",
      actualIntegrity: "sha512-expected",
    }),
    true
  );
  for (const actualIntegrity of [null, "", "sha512-other"]) {
    assert.equal(
      supersededCandidateArtifactIsCompatible({
        published: true,
        expectedIntegrity: "sha512-expected",
        actualIntegrity,
      }),
      false
    );
  }
});
