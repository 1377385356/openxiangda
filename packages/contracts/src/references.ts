/**
 * Same-application picker source for resource-reference fields.
 *
 * `snapshotFields` selects convenience display values copied into the direct
 * JSON field value. It does not create a foreign key, trusted target snapshot,
 * integrity check, or automatic refresh behavior.
 */
export type DataFieldResourceSourceFilter =
  | {
      field: string;
      operator: 'eq' | 'in';
      value: unknown;
    }
  | {
      field: string;
      operator: 'eq' | 'in';
      binding: { kind: 'field'; field: string };
    };

export interface DataFieldResourceSource {
  kind: 'resource';
  resourceCode: string;
  labelField: string;
  searchFields?: string[];
  descriptionFields?: string[];
  snapshotFields?: string[];
  filters?: DataFieldResourceSourceFilter[];
  pageSize?: number;
  loadMode?: 'search' | 'all';
}
