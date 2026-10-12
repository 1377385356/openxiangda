/** Pure expression document shape, independent of binding and evaluator modules. */
export const workflowExpressionSchema = {
  type: "object",
  required: ["op"],
  properties: {
    op: {
      enum: [
        "literal",
        "path",
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "lte",
        "in",
        "contains",
        "and",
        "or",
        "not",
        "exists",
      ],
    },
    value: {},
    path: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_.]{0,254}$" },
    left: { type: "object" },
    right: { type: "object" },
    values: { type: "array", minItems: 1, items: { type: "object" } },
  },
} as const;

