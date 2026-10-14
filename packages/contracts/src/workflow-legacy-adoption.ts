export interface WorkflowLegacyAdoptionPrepareV2 {
  schemaVersion: 'openxiangda.workflow-legacy-adoption-prepare/v2';
  environmentKey: 'preproduction' | 'production';
  requestKey: string;
  reason: string;
  expectedHeadRevision: number;
  workflowCode: string;
  resourceCode: string;
  recordId: string;
  expectedRevision: number;
  source: {
    system: string; recordKey: string; snapshotSha256: string; recordSha256: string;
  };
  checkpoint: {
    initiatorUserId: string; approvalRound: number; currentNodeId: string;
    initiatorField: string; initiatorIdentityField: string; roundField: string;
    stateField: string; stateValue: string;
    history: Array<{
      nodeId: string; reviewerDisplay: string; reviewedAt: string; opinion: string;
      reviewerField: string; reviewedAtField: string; opinionField: string;
    }>;
  };
}
export interface WorkflowLegacyAdoptionApplyV2 {
  schemaVersion: 'openxiangda.workflow-legacy-adoption-apply/v2';
  environmentKey: 'preproduction' | 'production';
  expectedPlanDigest: string;
}
