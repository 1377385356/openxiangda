import { Body, Controller, Inject, Post } from '@nestjs/common';
import { appOperations } from '@app/contracts';
import {
  CurrentUser, idempotentTransaction, OpenXiangdaBusinessDataApiService,
  OpenXiangdaLoggerService, OpenXiangdaOperation, type OpenXiangdaCurrentUser,
} from 'openxiangda/nest';

@Controller('/api/submissions')
export class SubmitController {
  constructor(
    @Inject(OpenXiangdaBusinessDataApiService) private readonly data: OpenXiangdaBusinessDataApiService,
    @Inject(OpenXiangdaLoggerService) private readonly logger: OpenXiangdaLoggerService,
  ) {}

  @Post()
  @OpenXiangdaOperation(appOperations.submissionSubmit)
  async submit(
    @Body() input: { title: string; idempotencyKey: string },
    @CurrentUser() user: OpenXiangdaCurrentUser,
  ) {
    // One immutable command: no read-before-write and no side effect before its receipt.
    const result = await this.data.transaction(idempotentTransaction(input.idempotencyKey, [
      { operation: 'create', resourceCode: 'requests', data: { title: input.title, submitted_by: user.userId } },
      { operation: 'create', resourceCode: 'submission-notes', data: { title: input.title, submitted_by: user.userId } },
    ]));
    this.logger.log('Submission committed', { step: 'commit', code: result.replayed ? 'REPLAYED' : 'CREATED' });
    return { idempotencyKey: result.idempotencyKey, replayed: result.replayed };
  }
}
