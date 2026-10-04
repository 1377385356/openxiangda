import type { DataRecordCommentMutation, DataRecordCommentReceipt } from 'openxiangda-contracts/browser';
import { OpenXiangdaPlatformRequestError } from '../../platform-client';

export type RecordCommentState = {
  busy: boolean;
  pending?: DataRecordCommentMutation;
  unknown?: boolean;
  retryAllowed?: boolean;
  error?: unknown;
  receipt?: DataRecordCommentReceipt;
};

/** Owns only one UI submission. The persisted comment is the sole commit/receipt owner. */
export function createRecordCommentSession(
  submit: (input: DataRecordCommentMutation) => Promise<DataRecordCommentReceipt>,
  recover: (key: string) => Promise<DataRecordCommentReceipt>,
  changed: (state: RecordCommentState) => void,
  newKey: () => string = () => crypto.randomUUID(),
) {
  let pending: DataRecordCommentMutation | undefined;
  let busy = false;
  let closed = false;
  let retryAllowed = false;
  const emit = (state: RecordCommentState) => { if (!closed) changed(state); };
  const sent = async () => {
    if (closed || busy || !pending) return;
    busy = true; retryAllowed = false;
    emit({ busy, pending });
    try {
      const receipt = await submit(pending);
      pending = undefined;
      emit({ busy: false, receipt });
    } catch (error) {
      const certain = error instanceof OpenXiangdaPlatformRequestError && [400, 401, 403, 404, 409, 413, 422].includes(error.status);
      if (certain) pending = undefined;
      emit({ busy: false, pending, unknown: !certain, error });
    } finally { busy = false; }
  };
  return {
    async send(body: string) {
      if (closed || busy || pending) return;
      pending = { schemaVersion: 'openxiangda.data-record-comment-create/v1', body, idempotencyKey: newKey() };
      await sent();
    },
    async recover() {
      if (closed || busy || !pending) return;
      busy = true;
      emit({ busy, pending, unknown: true });
      try {
        const receipt = await recover(pending.idempotencyKey);
        pending = undefined; retryAllowed = false;
        emit({ busy: false, receipt });
      } catch (error) {
        // 404 is only permission to resend the *same* request, never proof it cannot commit.
        retryAllowed = error instanceof OpenXiangdaPlatformRequestError &&
          error.status === 404 && error.code === 'OPENXIANGDA_NATIVE_RECORD_COMMENTS_RECEIPT_NOT_FOUND';
        emit({ busy: false, pending, unknown: true, retryAllowed, error });
      } finally { busy = false; }
    },
    async retry() { if (retryAllowed) await sent(); },
    close() { closed = true; },
  };
}
