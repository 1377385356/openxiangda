import assert from "node:assert/strict";
import test from "node:test";
import {
  validateNestControllerOperationSource,
  validateNestInjectionSource,
} from "../src/nest-injection-contract.js";

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

test("rejects a controller route without a declared operation binding", () => {
  const diagnostics = validateNestControllerOperationSource(`
    import { Body, Controller, Inject, Post } from '@nestjs/common';
    import { OpenXiangdaDataApiService } from 'openxiangda/nest';

    @Controller('/api/records')
    export class RecordsController {
      constructor(
        @Inject(OpenXiangdaDataApiService) private readonly data: OpenXiangdaDataApiService,
      ) {}

      @Post('/list')
      async list(@Body() query: unknown) {
        return this.data.list('records', query);
      }
    }
  `, "apps/server/src/records.controller.ts");

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "OPENXIANGDA_NEST_CONTROLLER_OPERATION_REQUIRED");
  assert.match(diagnostics[0]?.path || "", /records\.controller\.ts:\d+:\d+$/);
  assert.match(diagnostics[0]?.remediation || "", /development#backend-decision/);
});

test("accepts a controller bound to generated appOperations contracts", () => {
  const diagnostics = validateNestControllerOperationSource(`
    import { Body, Controller, Inject, Post } from '@nestjs/common';
    import { appOperations } from '@app/contracts';
    import { OpenXiangdaBusinessDataApiService, OpenXiangdaOperation } from 'openxiangda/nest';

    @Controller('/api/submissions')
    export class SubmitController {
      constructor(
        @Inject(OpenXiangdaBusinessDataApiService) private readonly data: OpenXiangdaBusinessDataApiService,
      ) {}

      @Post()
      @OpenXiangdaOperation(appOperations.submissionSubmit)
      async submit(@Body() input: unknown) {
        return this.data;
      }
    }
  `);

  assert.deepEqual(diagnostics, []);
});

test("rejects a hand-written operation contract literal", () => {
  const diagnostics = validateNestControllerOperationSource(`
    import { Controller, Post } from '@nestjs/common';
    import { OpenXiangdaOperation } from 'openxiangda/nest';

    @Controller('/api/records')
    export class RecordsController {
      @Post()
      @OpenXiangdaOperation({ operationCode: 'recordsList', requiredCapability: 'records.read' })
      async list() {
        return [];
      }
    }
  `, "apps/server/src/records.controller.ts");

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, "OPENXIANGDA_NEST_OPERATION_CONTRACT_MUST_BE_DECLARED");
});

test("supports namespace imports for route and operation decorators", () => {
  const diagnostics = validateNestControllerOperationSource(`
    import * as NestCommon from '@nestjs/common';
    import * as NestSdk from 'openxiangda/nest';
    import { appOperations } from '@app/contracts';

    @NestCommon.Controller('/api/records')
    export class RecordsController {
      @NestCommon.Get()
      @NestSdk.OpenXiangdaOperation(appOperations.recordsDetail)
      async detail() {
        return null;
      }
    }
  `);

  assert.deepEqual(diagnostics, []);
});
