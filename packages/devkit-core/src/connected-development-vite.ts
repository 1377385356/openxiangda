/** Serve-only routing metadata for ordinary-role source development.
 * Identity and authorization remain owned by the standard platform runtime. */
export function createConnectedDevelopmentVitePlugin(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return {
    name: 'openxiangda-connected-development-mount',
    apply: 'serve' as const,
    transformIndexHtml(html: string) {
      if (environment.OPENXIANGDA_CONNECTED_DEV !== 'true' ||
          environment.OPENXIANGDA_CONNECTED_DEV_IDENTITY !== 'browser') return [];
      const appCode = environment.OPENXIANGDA_APP_CODE;
      const environmentKey = environment.OPENXIANGDA_ENVIRONMENT_KEY;
      if (!appCode || !/^[a-z][a-z0-9-]{2,63}$/.test(appCode) || environmentKey !== 'preproduction') {
        throw new Error('OPENXIANGDA_CONNECTED_BROWSER_MOUNT_INVALID');
      }
      if (/<meta\b[^>]*\bname\s*=\s*["']openxiangda-(?:runtime-base|app-code|environment)["']/i.test(html)) {
        throw new Error('OPENXIANGDA_CONNECTED_BROWSER_MOUNT_CONFLICT');
      }
      return [
        ['openxiangda-runtime-base', '/'],
        ['openxiangda-app-code', appCode],
        ['openxiangda-environment', environmentKey],
      ].map(([name, content]) => ({ tag: 'meta', attrs: { name: name!, content: content! }, injectTo: 'head' as const }));
    },
  };
}
