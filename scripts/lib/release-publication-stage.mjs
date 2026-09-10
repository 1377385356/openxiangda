import {
  assertReferenceReleaseEvidenceMatches,
  inspectReferenceReleaseEvidence,
} from "./reference-application-state.mjs";
import { receiptRequiresReference } from './release-validation-plan.mjs';

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
    if (receiptRequiresReference(current)) {
      const actualReferenceEvidence = inspectReferenceReleaseEvidence(referenceRoot);
      assertReferenceReleaseEvidenceMatches(current.referenceApplication, actualReferenceEvidence);
    }
    preflightInitialPublication();
    current = { ...current, phase: "publishing-packages" };
    persistReceipt(current);
  }

  if (current.phase !== "publishing-packages") return current;
  return publishPackages(current);
}
