export * from 'openxiangda-devkit-core/testing';
export {
  assertRequiredCapabilitiesAvailable,
  OpenXiangdaApplicationServices,
  requiredPlatformCapabilities,
  verifySealedAppPackage,
} from 'openxiangda-devkit-core';
export {
  PLATFORM_CAPABILITY_CONTRACT_VERSIONS,
  sha256Digest,
  type PlatformCapabilityCode,
  type PlatformFeatureCapabilityContract,
  type RequiredPlatformCapabilityContract,
} from 'openxiangda-contracts';
export {
  verifyOpenXiangdaWebBuild,
  type OpenXiangdaWebBuildVerification,
} from './internal/web-build-verifier.js';
