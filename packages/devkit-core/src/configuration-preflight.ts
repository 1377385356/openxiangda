import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources } from './compiler/bundle.js';
import type { OpenXiangdaAppConfig } from './compiler/config.js';

/** 本地完整纯编译不创建客户端，不读取账号、环境、数据库或网络。 */
export function compileLocalConfiguration(config: OpenXiangdaAppConfig, toolchainVersion: string) {
  const sources = compileApplicationSources(config, toolchainVersion);
  const compiled = compileNativeApplicationConfiguration({
    appCode: config.app.code,
    configBytes: sources.config.content, contractBytes: sources.contracts.content,
    expectedConfigDigest: sources.config.digest, expectedContractDigest: sources.contracts.digest,
  });
  return { sources, compiled };
}
