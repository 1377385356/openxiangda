import type { DataRecordDeletionMutation, DataRecordDeletionPreview, DataRecordDeletionReceipt } from 'openxiangda-contracts/browser';
import { OpenXiangdaPlatformRequestError } from '../../platform-client';

export interface RecordDeletionState {
  busy: boolean;
  preview?: DataRecordDeletionPreview;
  pending?: DataRecordDeletionMutation;
  receipt?: DataRecordDeletionReceipt;
  error?: unknown;
  unknown?: boolean;
  retryAllowed?: boolean;
}

/** A single confirmation, with the original request retained until the existing receipt owner answers. */
export function createRecordDeletionSession(
  preview: () => Promise<DataRecordDeletionPreview>,
  submit: (input: DataRecordDeletionMutation) => Promise<DataRecordDeletionReceipt>,
  recover: (input: DataRecordDeletionMutation) => Promise<DataRecordDeletionReceipt>,
  changed: (state: RecordDeletionState) => void,
  newKey: () => string = () => crypto.randomUUID(),
  now: () => number = Date.now,
) {
  let state: RecordDeletionState = { busy: false };
  let closed = false;
  const emit = (next: RecordDeletionState) => { state = next; if (!closed) changed(next); };
  const fresh = () => Boolean(state.preview?.canCommit && state.preview.previewToken &&
    state.preview.expiresAt && Date.parse(state.preview.expiresAt) > now());
  const sent = async () => {
    if (closed || state.busy || !state.pending) return;
    const pending = state.pending;
    emit({ ...state, busy: true, retryAllowed: false, error: undefined });
    try {
      const receipt = await submit(pending);
      emit({ busy: false, receipt });
    } catch (error) {
      const certain = error instanceof OpenXiangdaPlatformRequestError && [400, 401, 403, 404, 409, 413, 422].includes(error.status);
      emit(certain ? { busy: false, error } : { ...state, busy: false, pending, unknown: true, error });
    }
  };
  return {
    async preview() {
      if (closed || state.busy || state.pending) return;
      emit({ busy: true });
      try { const result = await preview(); emit({ busy: false, preview: result }); }
      catch (error) { emit({ busy: false, error }); }
    },
    async confirm(reason: string) {
      if (closed || state.busy || state.pending || !fresh() || !reason.trim() || reason.trim().length > 1000) return;
      emit({ ...state, pending: { schemaVersion: 'openxiangda.data-record-deletion-request/v1',
        previewToken: state.preview!.previewToken!, idempotencyKey: newKey(), reason: reason.trim() } });
      await sent();
    },
    async recover() {
      if (closed || state.busy || !state.pending) return;
      const pending = state.pending;
      emit({ ...state, busy: true, retryAllowed: false });
      try { const receipt = await recover(pending); emit({ busy: false, receipt }); }
      catch (error) {
        const notFound = error instanceof OpenXiangdaPlatformRequestError && error.status === 404 &&
          error.code === 'OPENXIANGDA_NATIVE_RECORD_DELETION_RECEIPT_NOT_FOUND';
        emit({ ...state, busy: false, pending, unknown: true, error, retryAllowed: notFound && fresh() });
      }
    },
    async retry() { if (state.retryAllowed && fresh()) await sent(); },
    close() { closed = true; },
  };
}
