import { verifyOpenXiangdaWebBuild } from 'openxiangda/testing';

const result = verifyOpenXiangdaWebBuild(new URL('../dist', import.meta.url));
process.stdout.write(
  `Verified Vite build: ${result.totalBytes} bytes, ${result.totalJavaScriptGzipBytes} total gzip bytes, ${result.initialJavaScriptGzipBytes} initial gzip bytes.\n`
);
