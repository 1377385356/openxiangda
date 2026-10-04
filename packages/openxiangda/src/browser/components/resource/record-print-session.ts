import type { DataRecordPrint } from 'openxiangda-contracts/browser';

export type RecordPrintState = { busy: boolean; data?: DataRecordPrint; error?: unknown };

/** A preview owns only its outstanding reads; Native owns permission and record facts. */
export function createRecordPrintSession(
  load: () => Promise<DataRecordPrint>,
  changed: (state: RecordPrintState) => void,
  renderComplete: () => Promise<void>,
  print: () => void,
) {
  let sequence = 0;
  let closed = false;
  return {
    async read(printAfter = false) {
      if (closed) return;
      const current = ++sequence;
      changed({ busy: true });
      try {
        const data = await load();
        if (closed || current !== sequence) return;
        changed({ busy: printAfter, data });
        if (printAfter) {
          await renderComplete();
          if (closed || current !== sequence) return;
          print();
          changed({ busy: false, data });
        }
      } catch (error) {
        if (!closed && current === sequence) changed({ busy: false, error });
      }
    },
    close() { closed = true; sequence++; },
  };
}
