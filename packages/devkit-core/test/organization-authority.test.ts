import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  canonicalJson,
  sha256Digest,
  validateDataResource,
  validateNativeOrganizationAuthorization,
} from "openxiangda-contracts";
import { compileNativeApplicationConfiguration } from "openxiangda-contracts/native-compiler";
import {
  compileApplicationSources,
  defineOpenXiangdaApp,
  defineDataModel,
  defineApplicationModule,
  requiredPlatformCapabilities,
  resourceRoleCapabilities,
  type OpenXiangdaAppDeclaration,
} from "../src/index.js";

const cjs = createRequire(import.meta.url)(
  "openxiangda-contracts/native-compiler"
);
const source = (): OpenXiangdaAppDeclaration => ({
  app: { code: "org-example", name: "Organization example" },
  authz: {
    capabilities: [],
    roles: [
      {
        code: "teacher",
        name: "Teacher",
        organizationReach: "self",
        capabilities: resourceRoleCapabilities(
          "org-example",
          "assignments",
          "manage"
        ),
      },
    ],
    scopeDimensions: [{ code: "class", name: "Class", valueType: "string" }],
    directoryRoleSources: [
      {
        code: "teachers",
        name: "Teacher facts",
        source: "dingtalk_school_contact",
        roleFactCode: "teacher",
        roleCode: "teacher",
        scopes: [
          {
            dimensionCode: "class",
            scopeType: "class",
            operations: ["create", "read"],
          },
        ],
        failureMode: "strict",
      },
    ],
  },
  data: {
    resources: [
      {
        code: "assignments",
        name: "Assignments",
        organization: { mode: "owned" },
        fields: [
          { code: "classId", label: "Class", type: "text.short" },
          { code: "title", label: "Title", type: "text.short" },
        ],
      },
    ],
  },
});
function platform(
  output: ReturnType<typeof compileApplicationSources>,
  mutate?: (value: any) => void
) {
  const config = structuredClone(output.config.value),
    contract = structuredClone(output.contracts.value);
  mutate?.(config);
  contract.configDigest = sha256Digest(config);
  return compileNativeApplicationConfiguration({
    appCode: "org-example",
    configBytes: canonicalJson(config),
    contractBytes: canonicalJson(contract),
    expectedConfigDigest: sha256Digest(config),
    expectedContractDigest: sha256Digest(contract),
  });
}

test("authoring, independent platform compiler, model and negotiation preserve the same organization boundary", () => {
  const defined = defineOpenXiangdaApp(source()),
    output = compileApplicationSources(defined),
    native = platform(output);
  assert.equal(output.config.value.authz.roles[0].organizationReach, "self");
  assert.deepEqual(
    output.config.value.authz.directoryRoleSources,
    source().authz!.directoryRoleSources
  );
  assert.deepEqual(
    native.projections.authz.value.directoryRoleSources,
    output.config.value.authz.directoryRoleSources
  );
  assert.deepEqual(native.projections.data.value.resources[0].organization, {
    mode: "owned",
  });
  assert.deepEqual(
    validateDataResource(output.config.value.data.resources[0]),
    []
  );
  for (const code of [
    "authz.organizations",
    "authz.directory-roles",
    "data.organizations",
  ]) {
    const client = requiredPlatformCapabilities(defined).find(
        (item) => item.code === code
      ),
      server = native.requiredPlatformCapabilities.find(
        (item) => item.code === code
      );
    assert.ok(client && server);
    assert.deepEqual(client, server);
  }
  const model = defineDataModel({
    code: "assignments",
    name: "Assignments",
    fields: source().data!.resources[0].fields,
    organization: { mode: "inherited-down" },
  });
  const value = source();
  delete value.data;
  value.modules = [
    defineApplicationModule({ code: "teaching", models: [model] }),
  ];
  const fromModel = compileApplicationSources(defineOpenXiangdaApp(value));
  assert.deepEqual(fromModel.config.value.data.resources[0].organization, {
    mode: "inherited-down",
  });
  assert.doesNotThrow(() => platform(fromModel));
});

test("traditional declarations retain their prior policy and negotiate no organization feature", () => {
  const value = source();
  delete value.authz!.directoryRoleSources;
  delete value.authz!.roles[0].organizationReach;
  delete value.data!.resources[0].organization;
  const defined = defineOpenXiangdaApp(value),
    native = platform(compileApplicationSources(defined));
  assert.equal(native.projections.authz.value.directoryRoleSources, undefined);
  assert.ok(
    !requiredPlatformCapabilities(defined).some((item) =>
      [
        "authz.organizations",
        "authz.directory-roles",
        "data.organizations",
      ].includes(item.code)
    )
  );
});

test("malformed, missing-scope, invented authority and cross-owner sources fail in both portable validators", () => {
  const compiled = compileApplicationSources(defineOpenXiangdaApp(source()))
    .config.value;
  const cases: Array<(config: any) => void> = [
    (value) => {
      value.authz.roles[0].organizationReach = "all-tenants";
    },
    (value) => {
      delete value.authz.roles[0].organizationReach;
    },
    (value) => {
      value.authz.directoryRoleSources[0].roleCode = "unknown";
    },
    (value) => {
      value.authz.directoryRoleSources[0].failureMode = "last_known_good";
    },
    (value) => {
      value.authz.directoryRoleSources[0].scopes[0].operations = [];
    },
    (value) => {
      value.authz.scopeDimensions[0].valueType = "uuid";
    },
    (value) => {
      value.authz.scopeDimensions[0].resourceCode = "assignments";
    },
    (value) => {
      value.authz.scopeDimensions[0].valueSource = {
        resourceCode: "assignments",
      };
    },
    (value) => {
      value.authz.scopeDimensions[0].hierarchyMode = "tree";
    },
    (value) => {
      value.authz.directoryRoleSources[0].scopes[0].organizationId =
        "caller-selected";
    },
    (value) => {
      value.data.resources[0].organization = {
        mode: "owned",
        organizationId: "caller-selected",
      };
    },
    (value) => {
      value.authz.directoryRoleSources.push({
        ...value.authz.directoryRoleSources[0],
      });
    },
  ];
  for (const mutate of cases) {
    const value = structuredClone(compiled);
    mutate(value);
    for (const validate of [
      validateNativeOrganizationAuthorization,
      cjs.validateNativeOrganizationAuthorization,
    ])
      assert.throws(
        () => validate(value),
        (error: any) => /^NATIVE_(?:DIRECTORY|ORGANIZATION)_/.test(error.code)
      );
    assert.throws(
      () =>
        platform(
          compileApplicationSources(defineOpenXiangdaApp(source())),
          mutate
        ),
      (error: any) => /^NATIVE_(?:DIRECTORY|ORGANIZATION)_/.test(error.code)
    );
  }
  assert.doesNotThrow(() =>
    validateNativeOrganizationAuthorization({
      authz: { roleMembershipSources: {} },
      data: { resources: {} },
    })
  );
});
