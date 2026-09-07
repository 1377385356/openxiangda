export interface RuntimeMount {
  runtimeBase: string;
  appCode: string;
  environmentKey: 'preproduction' | 'production';
}

interface ApplicationIdentity {
  appCode: string;
  appName: string;
}

let configuredApplicationIdentity: ApplicationIdentity | null = null;
let activePerspectiveCode: string | null = null;

export function configureApplicationIdentity(identity: ApplicationIdentity) {
  const appCode = identity.appCode.trim();
  const appName = identity.appName.trim();
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(appCode) || !appName) {
    throw new Error('OPENXIANGDA_APPLICATION_IDENTITY_INVALID');
  }
  if (
    configuredApplicationIdentity &&
    (configuredApplicationIdentity.appCode !== appCode ||
      configuredApplicationIdentity.appName !== appName)
  ) {
    throw new Error('OPENXIANGDA_APPLICATION_IDENTITY_ALREADY_CONFIGURED');
  }
  configuredApplicationIdentity = Object.freeze({ appCode, appName });
  return configuredApplicationIdentity;
}

export function readRuntimeMount(
  read: (name: string) => string | undefined
): RuntimeMount | null {
  const runtimeBase = read('openxiangda-runtime-base')?.trim();
  const appCode = read('openxiangda-app-code')?.trim();
  const environment = read('openxiangda-environment')?.trim();
  if (!runtimeBase && !appCode && !environment) return null;
  if (
    !runtimeBase ||
    !appCode ||
    (environment !== 'preproduction' && environment !== 'production')
  ) {
    throw new Error('OPENXIANGDA_RUNTIME_META_INVALID');
  }
  return { runtimeBase, appCode, environmentKey: environment };
}

export function runtimeMount() {
  if (typeof document === 'undefined') return null;
  return readRuntimeMount(name =>
    document
      .querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
      ?.content.trim()
  );
}

export function applicationCode() {
  const mounted = runtimeMount();
  if (
    mounted &&
    configuredApplicationIdentity &&
    mounted.appCode !== configuredApplicationIdentity.appCode
  ) {
    throw new Error('OPENXIANGDA_APPLICATION_IDENTITY_MISMATCH');
  }
  const appCode = mounted?.appCode || configuredApplicationIdentity?.appCode;
  if (!appCode) throw new Error('OPENXIANGDA_APPLICATION_IDENTITY_REQUIRED');
  return appCode;
}

export function applicationName() {
  if (!configuredApplicationIdentity) {
    throw new Error('OPENXIANGDA_APPLICATION_IDENTITY_REQUIRED');
  }
  return configuredApplicationIdentity.appName;
}

export function setActivePerspectiveCode(code: string | null) {
  const normalized = String(code || '').trim();
  if (
    normalized &&
    !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(normalized)
  ) {
    throw new Error('OPENXIANGDA_PERSPECTIVE_CODE_INVALID');
  }
  activePerspectiveCode = normalized || null;
}

export function currentPerspectiveCode() {
  return activePerspectiveCode;
}

export function resolveApplicationBasename(mount: RuntimeMount | null) {
  if (!mount) return undefined;
  const pathname = new URL(mount.runtimeBase, 'https://runtime.local').pathname;
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

export function applicationBasename() {
  return resolveApplicationBasename(runtimeMount());
}

export function attachmentPreviewPath(resourceCode: string, fileId: string) {
  return resolveAttachmentPreviewPath(runtimeMount(), resourceCode, fileId);
}

export function resolveAttachmentPreviewPath(
  mount: RuntimeMount | null,
  resourceCode: string,
  fileId: string
) {
  const base = resolveApplicationBasename(mount)?.replace(/\/+$/, '') || '';
  return `${base}/files/${encodeURIComponent(resourceCode)}/${encodeURIComponent(
    fileId
  )}/preview`;
}

export function resolveApplicationApiPath(
  mount: RuntimeMount | null,
  path: string
) {
  if (!mount) return `/${path.replace(/^\/+/, '')}`;
  return `/service/openxiangda-app-api/v2/${encodeURIComponent(
    mount.appCode
  )}/${encodeURIComponent(mount.environmentKey)}/${path.replace(/^\/+/, '')}`;
}

export function applicationApiPath(path: string) {
  return resolveApplicationApiPath(runtimeMount(), path);
}
