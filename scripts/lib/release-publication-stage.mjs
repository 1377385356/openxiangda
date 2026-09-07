import {
  assertReferenceReleaseEvidenceMatches,
  inspectReferenceReleaseEvidence,
} from "./reference-application-state.mjs";

export function runPackagePublicationStage(
  receipt,
  {
    referenceRoot,
    preflightInitialPublication,
    persistReceipt,
    publishPackages,
  }
) {
  let current = receipt;
  if (current.phase === "validated") {
    const actualReferenceEvidence =
      inspectReferenceReleaseEvidence(referenceRoot);
    assertReferenceReleaseEvidenceMatches(
      current.referenceApplication,
      actualReferenceEvidence
    );
    preflightInitialPublication();
    current = { ...current, phase: "publishing-packages" };
    persistReceipt(current);
  }

  if (current.phase !== "publishing-packages") return current;
  return publishPackages(current);
}
