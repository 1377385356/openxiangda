import type { ApplicationContractCompatibility, ConfigurationValidationResult, PlatformCapabilities, RequiredPlatformCapabilityContract } from 'openxiangda-contracts';
import { ControlPlaneError } from './control-plane-client.js';
import { assertApplicationContractCompatible, assertRequiredCapabilitiesAvailable } from './deployment.js';

export interface TargetReadinessFacts {
  site: string; appCode: string; environmentKey: string; platformVersion: string; observedAt: string;
}
/** Read-only preflight. Capability gaps do not conceal independent configuration gaps. */
export async function collectTargetReadiness(input: {
  site: string; appCode: string; environmentKey: string; capabilities: PlatformCapabilities;
  required: ApplicationContractCompatibility; requiredCapabilities: RequiredPlatformCapabilityContract[];
  inspect: () => Promise<ConfigurationValidationResult>;
}) {
  const target: TargetReadinessFacts = { site: input.site, appCode: input.appCode, environmentKey: input.environmentKey,
    platformVersion: input.capabilities.platformVersion, observedAt: new Date().toISOString() };
  try { assertApplicationContractCompatible(input.capabilities, input.required); }
  catch (error) { throw withTarget(error, target); }
  let capabilityError: ControlPlaneError | undefined;
  try { assertRequiredCapabilitiesAvailable(input.capabilities, input.requiredCapabilities); }
  catch (error) { if (!(error instanceof ControlPlaneError)) throw error; capabilityError = error; }
  let result: ConfigurationValidationResult | undefined; let configurationError: unknown;
  try { result = await input.inspect(); } catch (error) { configurationError = error; }
  const first = capabilityError || configurationError;
  if (first) {
    const unavailable = (capabilityError?.data as any)?.unavailable || [];
    const data = configurationError instanceof ControlPlaneError ? objectData(configurationError.data) : {};
    const issues = [
      ...unavailable.map((item: {code: string}) => ({ code: 'OPENXIANGDA_REQUIRED_CAPABILITY_UNAVAILABLE', pointer: `/requiredPlatformCapabilities/${item.code}`, capability: item })),
      ...(Array.isArray(data.issues) ? data.issues : configurationError ? [{ code: configurationError instanceof ControlPlaneError ? configurationError.code : 'OPENXIANGDA_DEPLOYMENT_PREFLIGHT_UNAVAILABLE', pointer: typeof data.pointer === 'string' ? data.pointer : '/' }] : []),
    ];
    throw withTarget(first, target, { ...data, unavailable, issues,
      ...(configurationError instanceof ControlPlaneError && configurationError.remote?.requestId ? { configurationRequestId: configurationError.remote.requestId } : {}) });
  }
  return { ...result!, target };
}
function objectData(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function withTarget(error: unknown, target: TargetReadinessFacts, extra: Record<string, unknown> = {}) {
  if (error instanceof ControlPlaneError) return new ControlPlaneError(error.status, error.code, error.message,
    { ...objectData(error.data), ...extra, target }, error.remote);
  return new ControlPlaneError(503, 'OPENXIANGDA_DEPLOYMENT_PREFLIGHT_UNAVAILABLE', '目标只读预检暂时不可用，请按同一目标重新检查', { ...extra, target });
}
