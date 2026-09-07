import assert from "node:assert/strict";
import test from "node:test";
import { validateNestInjectionSource } from "../src/nest-injection-contract.js";

test("rejects implicit Nest constructor injection", () => {
  const diagnostics = validateNestInjectionSource(`
    import { Controller } from '@nestjs/common';
    import { OpenXiangdaStandardOperations } from 'openxiangda-nest';
    @Controller('/api/visitors')
    export class VisitorController {
      constructor(private readonly operations: OpenXiangdaStandardOperations) {}
    }
  `, "apps/server/src/visitor.controller.ts");

  assert.equal(diagnostics.length, 1);
  assert.equal(
    diagnostics[0]?.code,
    "OPENXIANGDA_NEST_EXPLICIT_INJECTION_REQUIRED"
  );
  assert.match(diagnostics[0]?.path || "", /visitor\.controller\.ts:\d+:\d+$/);
});

test("accepts explicit Nest constructor injection and namespace decorators", () => {
  const diagnostics = validateNestInjectionSource(`
    import * as Nest from '@nestjs/common';
    import { OpenXiangdaStandardOperations } from 'openxiangda-nest';
    @Nest.Controller('/api/visitors')
    export class VisitorController {
      constructor(
        @Nest.Inject(OpenXiangdaStandardOperations)
        private readonly operations: OpenXiangdaStandardOperations
      ) {}
    }
  `);

  assert.deepEqual(diagnostics, []);
});
