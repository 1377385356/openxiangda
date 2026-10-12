import { closeSync, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { APPLICATION_AGENT_LIMITS_V2, assertApplicationAgentInstructionPathV2, NativeApplicationAgentContractError } from 'openxiangda-contracts/native-compiler';
import type { OpenXiangdaAppDeclaration } from './compiler/config.js';

/** Read only regular contained source files. No network, credential or collaboration file inputs. */
export function inlineApplicationAgentInstructionsV2(root: string, declaration: OpenXiangdaAppDeclaration): OpenXiangdaAppDeclaration {
  if (!declaration.agents?.length) return declaration;
  const workspace = realpathSync(root);
  return { ...declaration, agents: declaration.agents.map((agent, index) => {
    if (typeof agent.instructions === 'string') return agent;
    const pointer = `/agents/${index}/instructions`;
    const file = assertApplicationAgentInstructionPathV2(agent.instructions?.file, `${pointer}/file`);
    const target = realpathSync(resolve(workspace, file));
    const rel = relative(workspace, target);
    if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || resolve(workspace, rel) !== target)
      throw new NativeApplicationAgentContractError('NATIVE_APPLICATION_AGENT_INSTRUCTION_PATH_INVALID', pointer, '指令文件必须位于当前工作区');
    // The requested path and resolved basename must both pass the exclusion.
    assertApplicationAgentInstructionPathV2(rel.split(sep).join('/'), `${pointer}/file`);
    const fd = openSync(target, 'r');
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > APPLICATION_AGENT_LIMITS_V2.instructionBytes)
        throw new NativeApplicationAgentContractError('NATIVE_APPLICATION_AGENT_INSTRUCTION_FILE_LIMIT', pointer, '指令源必须是最多 64000 字节的普通文件');
      const bytes = Buffer.alloc(APPLICATION_AGENT_LIMITS_V2.instructionBytes + 1);
      let count = 0;
      while (count < bytes.length) {
        const read = readSync(fd, bytes, count, bytes.length - count, null);
        if (!read) break;
        count += read;
      }
      if (count > APPLICATION_AGENT_LIMITS_V2.instructionBytes)
        throw new NativeApplicationAgentContractError('NATIVE_APPLICATION_AGENT_INSTRUCTION_FILE_LIMIT', pointer, '指令文件读取超出 64000 字节');
      const instructions = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
      if (!instructions.trim() || instructions.length > APPLICATION_AGENT_LIMITS_V2.instructions)
        throw new NativeApplicationAgentContractError('NATIVE_APPLICATION_AGENT_TEXT_INVALID', pointer, '指令最多 16000 字符且不能为空');
      return { ...agent, instructions };
    } finally { closeSync(fd); }
  }) };
}
