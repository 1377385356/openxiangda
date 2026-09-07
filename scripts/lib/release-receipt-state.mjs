const PREPUBLICATION_PHASES = new Set(["planned", "validated"]);
const PUBLICATION_PHASES = new Set([
  "publishing-packages",
  "packages-published",
  "dist-tags-synchronized",
  "complete",
]);

export function releasePublicationHasStarted(value) {
  return PUBLICATION_PHASES.has(value?.phase);
}

export function releaseInvocationAction(value, { validateOnly = false } = {}) {
  const phase = value?.phase;
  if (validateOnly) {
    if (!value || phase === "planned") return "validate";
    if (phase === "validated") return "verified";
    if (PUBLICATION_PHASES.has(phase)) {
      throw new Error(
        "Release publication has already started; resume it with the matching release:publish command"
      );
    }
    throw new Error(`Unsupported release receipt phase: ${String(phase)}`);
  }

  if (!value || phase === "planned") {
    throw new Error(
      "No validated release receipt is available; run the matching verify:release command first"
    );
  }
  if (phase === "validated") return "publish";
  if (PUBLICATION_PHASES.has(phase)) return "resume";
  throw new Error(`Unsupported release receipt phase: ${String(phase)}`);
}

export function isSupersededPrepublicationReceipt(value, head) {
  return Boolean(
    value && value.head !== head && PREPUBLICATION_PHASES.has(value.phase)
  );
}

export function isSupersededReferencePrepublicationReceipt(value, currentEvidence) {
  if (!value || !PREPUBLICATION_PHASES.has(value.phase)) return false;
  const plannedEvidence = value.referenceApplication;
  if (!plannedEvidence || !currentEvidence) return false;
  return ["head", "packageJsonSha256", "pnpmLockSha256"].some(
    field => plannedEvidence[field] !== currentEvidence[field]
  );
}

export function supersededCandidateArtifactIsCompatible({
  published,
  expectedIntegrity,
  actualIntegrity,
}) {
  if (!published) return true;
  return (
    typeof expectedIntegrity === "string" &&
    expectedIntegrity.length > 0 &&
    actualIntegrity === expectedIntegrity
  );
}
