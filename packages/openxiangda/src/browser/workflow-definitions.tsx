import { createContext, useContext, type ReactNode } from 'react';
import {
  WORKFLOW_SUMMARY_MAX_FIELDS,
  type AppWorkflowLaunchContextDeclaration,
  type AppWorkflowLaunchInputBindingDeclaration,
  type AppWorkflowNamedOperationOutputDeclaration,
} from 'openxiangda-contracts/browser';

export interface WorkflowSubjectDefinition {
  resourceCode: string;
  factProjection: Record<string, string>;
  /**
   * Fields selected by the compiler for the bounded business summary.
   *
   * Generated application definitions are intentionally emitted with
   * `as const`; accepting a readonly array keeps the public input contract
   * compatible with those generated literals while normalizeWorkflowDefinitions
   * still copies the values into its own mutable runtime representation.
   */
  summaryFields?: readonly string[];
}

interface GeneratedWorkflowDefinitionBase {
  code: string;
  title: string;
  description?: string;
  subject: WorkflowSubjectDefinition;
  detailRouteCode?: {
    desktop: string;
    mobile: string;
  };
}

export interface GeneratedWorkflowNamedOperationIntent {
  operationCode: string;
  method: 'POST';
  path: string;
  requiredCapability: string;
  requestSchemaDigest: string;
  responseSchemaDigest: string;
  inputs: Readonly<Record<string, AppWorkflowLaunchInputBindingDeclaration>>;
  output: AppWorkflowNamedOperationOutputDeclaration;
}

export interface GeneratedWorkflowNamedOperationSubmission {
  kind: 'named-operation';
  create?: GeneratedWorkflowNamedOperationIntent;
  existing?: GeneratedWorkflowNamedOperationIntent;
  context: readonly AppWorkflowLaunchContextDeclaration[];
}

export type GeneratedWorkflowDefinition =
  | (GeneratedWorkflowDefinitionBase & {
      launch: {
        mode: 'standalone' | 'hidden-handoff';
        submission?: never;
      };
      processOperationCode: string;
    })
  | (GeneratedWorkflowDefinitionBase & {
      launch: {
        mode: 'standalone' | 'hidden-handoff';
        submission: GeneratedWorkflowNamedOperationSubmission;
      };
      processOperationCode?: never;
    })
  | (GeneratedWorkflowDefinitionBase & {
      launch: {
        mode: 'custom-page' | 'work-center-only';
        submission?: never;
      };
      processOperationCode?: never;
    });

export type StandardWorkflowDefinition = GeneratedWorkflowDefinition;
export type StandardWorkflowDefinitionsInput =
  readonly StandardWorkflowDefinition[];

export function normalizeWorkflowDefinitions(
  input: StandardWorkflowDefinitionsInput,
) {
  const definitions = new Map<string, StandardWorkflowDefinition>();
  for (const entry of input) {
    const definition = { ...entry } as StandardWorkflowDefinition;
    const code = String(definition.code || '').trim();
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(code)) {
      throw new Error(`OPENXIANGDA_WORKFLOW_CODE_INVALID: ${code}`);
    }
    if (definitions.has(code)) {
      throw new Error(`OPENXIANGDA_WORKFLOW_CODE_DUPLICATE: ${code}`);
    }
    const title = String(definition.title || '').trim();
    if (!title || title === code) {
      throw new Error(`OPENXIANGDA_WORKFLOW_TITLE_INVALID: ${code}`);
    }
    const subject = definition.subject;
    if (
      !subject ||
      !/^[a-z][a-z0-9-]{2,63}$/.test(subject.resourceCode) ||
      !subject.factProjection ||
      Object.keys(subject.factProjection).length === 0
    ) {
      throw new Error(`OPENXIANGDA_WORKFLOW_SUBJECT_INVALID: ${code}`);
    }
    const summaryFields = subject.summaryFields;
    if (
      summaryFields !== undefined &&
      (!Array.isArray(summaryFields) ||
        summaryFields.length > WORKFLOW_SUMMARY_MAX_FIELDS ||
        new Set(summaryFields).size !== summaryFields.length ||
        summaryFields.some(
          field =>
            typeof field !== 'string' ||
            !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(field),
        ))
    ) {
      throw new Error(`OPENXIANGDA_WORKFLOW_SUMMARY_FIELDS_INVALID: ${code}`);
    }
    const standard = ['standalone', 'hidden-handoff'].includes(
      definition.launch.mode,
    );
    const namedSubmission = definition.launch.submission;
    const expectedOperationCode = `openxiangda.workflow.${code}.submit`;
    if (
      standard
        ? namedSubmission
          ? definition.processOperationCode !== undefined ||
            namedSubmission.kind !== 'named-operation' ||
            (!namedSubmission.create && !namedSubmission.existing)
          : definition.processOperationCode !== expectedOperationCode
        : definition.processOperationCode !== undefined ||
          namedSubmission !== undefined
    ) {
      throw new Error(
        `OPENXIANGDA_WORKFLOW_PROCESS_OPERATION_INVALID: ${code}`,
      );
    }
    definitions.set(
      code,
      Object.freeze({
        ...definition,
        code,
        title,
        subject: {
          ...subject,
          summaryFields: summaryFields ? [...summaryFields] : [],
        },
      }),
    );
  }
  return definitions;
}

const WorkflowDefinitionsContext = createContext<
  ReadonlyMap<string, StandardWorkflowDefinition>
>(new Map());

export function OpenXiangdaWorkflowDefinitionsProvider({
  children,
  definitions,
}: {
  children: ReactNode;
  definitions: StandardWorkflowDefinitionsInput;
}) {
  return (
    <WorkflowDefinitionsContext.Provider
      value={normalizeWorkflowDefinitions(definitions)}
    >
      {children}
    </WorkflowDefinitionsContext.Provider>
  );
}

export function useWorkflowDefinitions() {
  return useContext(WorkflowDefinitionsContext);
}

export function useWorkflowDefinition(code: string) {
  return useWorkflowDefinitions().get(code);
}
