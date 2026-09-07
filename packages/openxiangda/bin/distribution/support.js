import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fail, flagValue, readJson } from './workspace.js';
import supportCommands from './support-commands.json' with { type: 'json' };

export const SUPPORT_CHANNEL_URL = 'https://evaluate-oss.oss-cn-hangzhou.aliyuncs.com/static/lowcode/support/channel.json';
export const DWS_STABLE_VERSION = '1.0.61';
const coreReferences = ['dingtalk-shared/SKILL.md', 'dingtalk-misc/references/profile.md', 'dingtalk-chat/SKILL.md', 'dingtalk-event/SKILL.md'];

export async function loadSupportChannel(fetcher = fetch) {
  const response = await fetcher(SUPPORT_CHANNEL_URL, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  if (!response.ok) fail('SUPPORT_CHANNEL_UNAVAILABLE', `HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 16 * 1024) fail('SUPPORT_CHANNEL_TOO_LARGE', '通道配置超过 16 KiB');
    chunks.push(chunk);
  }
  const channel = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\s,:]/.test(value);
  if (channel.schemaVersion !== 'openxiangda.support-channel/v1' || !identifier(channel.id) || !identifier(channel.corpId)
    || typeof channel.conversationId !== 'string' || !channel.conversationId || channel.conversationId.length > 1024
    || typeof channel.name !== 'string' || channel.name.length > 256 || !Number.isSafeInteger(channel.revision) || channel.revision < 1) {
    fail('SUPPORT_CHANNEL_INVALID', '通道配置不符合当前契约');
  }
  let invitation;
  try { invitation = new URL(channel.inviteUrl); } catch { fail('SUPPORT_INVITE_URL_INVALID', '邀请地址格式无效'); }
  if (typeof channel.inviteUrl !== 'string' || channel.inviteUrl.length > 8192 || /[\r\n\0]/.test(channel.inviteUrl)
    || !['https:', 'dingtalk:'].includes(invitation.protocol) || invitation.username || invitation.password) {
    fail('SUPPORT_INVITE_URL_INVALID', '邀请地址协议无效');
  }
  return channel;
}

export function selectSupportProfile(profiles, corpId, requested) {
  if (requested) {
    if (!/^[^:\s,]+:[^:\s,]+$/.test(requested)) fail('SUPPORT_PROFILE_INVALID', '使用 profile list 返回的 corpId:userId');
    if (requested.split(':')[0] !== corpId) fail('SUPPORT_PROFILE_ORGANIZATION_MISMATCH', '所选账号不属于支持通道组织');
    return profiles.find(item => item.profile === requested && item.corpId === corpId && `${item.corpId}:${item.userId}` === requested) || null;
  }
  const candidates = profiles.filter(item => item.corpId === corpId && item.isOrgCurrent === true && item.profile === `${item.corpId}:${item.userId}`);
  return candidates.length === 1 ? candidates[0] : null;
}

export function supportVersion(output) {
  const match = /\bdws version v?(\d+)\.(\d+)\.(\d+)(?![\d.-])/.exec(output);
  if (!match) return null;
  const current = match.slice(1).map(Number), minimum = DWS_STABLE_VERSION.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (current[i] > minimum[i]) return current.join('.');
    if (current[i] < minimum[i]) return null;
  }
  return current.join('.');
}

export async function supportOperation(packageRoot, args, overrides = {}) {
  const action = args[1] || 'status';
  if (!supportCommands.commands.includes(`support:${action}`)) fail('SUPPORT_ACTION_INVALID', action);
  const taskHome = overrides.home || homedir();
  const stateFile = overrides.stateFile || join(process.env.XDG_CONFIG_HOME || join(taskHome, '.config'), 'openxiangda', 'support.json');
  const skillsHome = overrides.skillsHome || join(taskHome, '.agents', 'skills');
  const run = overrides.run || runSupportProcess;
  const channelLoader = overrides.loadChannel || loadSupportChannel;
  const requested = flagValue(args, '--profile');
  const target = flagValue(args, '--agent') || 'all';
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(target)) fail('SUPPORT_AGENT_INVALID', target);
  if (args.includes('--dry-run')) return { state: 'planned', action, channelUrl: SUPPORT_CHANNEL_URL, dwsPackage: `dingtalk-workspace-cli@${DWS_STABLE_VERSION}`, skills: 'official-full-multi', target, userActionRequired: ['OAuth', 'DingTalk group join'] };
  const result = { state: 'setup_required', action, channelUrl: SUPPORT_CHANNEL_URL, dws: { available: false }, skills: { ready: false }, nextActions: [] };
  let releaseLock = () => {};
  try {
    if (action !== 'status') {
      mkdirSync(dirname(stateFile), { recursive: true, mode: 0o700 });
      const lock = `${stateFile}.lock`;
      try { mkdirSync(lock, { mode: 0o700 }); } catch (error) { if (error.code === 'EEXIST') fail('SUPPORT_BUSY', `另一个接入操作正在执行；检查 ${lock}`); throw error; }
      releaseLock = () => rmSync(lock, { recursive: true, force: true });
    }
    const saved = existsSync(stateFile) ? readJson(stateFile) : {};
    const persist = patch => {
      const temporary = `${stateFile}.${randomUUID()}.tmp`;
      writeFileSync(temporary, `${JSON.stringify({ ...saved, ...patch, schemaVersion: 'openxiangda.support-state/v1' }, null, 2)}\n`, { mode: 0o600 });
      try { renameSync(temporary, stateFile); } finally { rmSync(temporary, { force: true }); }
      Object.assign(saved, patch);
    };
    let versionResult = await run('dws', ['--version']);
    let version = versionResult.status === 0 ? supportVersion(versionResult.stdout) : null;
    if (!version && action === 'bootstrap') {
      const installed = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--global', `dingtalk-workspace-cli@${DWS_STABLE_VERSION}`, '--registry', 'https://registry.npmjs.org', '--no-fund', '--no-audit'], { timeout: 120_000 });
      if (installed.status !== 0) return pending(result, 'dws_unavailable', 'SUPPORT_DWS_INSTALL_FAILED', 'openxiangda support bootstrap');
      versionResult = await run('dws', ['--version']);
      version = versionResult.status === 0 ? supportVersion(versionResult.stdout) : null;
    }
    if (!version) return pending(result, 'dws_unavailable', 'SUPPORT_DWS_STABLE_REQUIRED', 'openxiangda support bootstrap');
    result.dws = { available: true, version };
    const referencesPresent = () => coreReferences.every(file => existsSync(join(skillsHome, file)));
    if (action === 'bootstrap') {
      installSupportGuidance(packageRoot, skillsHome);
      if (args.includes('--force') || saved.skillsVersion !== version || saved.skillsTarget !== target || !referencesPresent()) {
        const setup = await run('dws', ['skill', 'setup', '--mode', 'multi', '--target', target, '--yes'], { timeout: 60_000, officialSkills: true });
        if (setup.status !== 0 || !referencesPresent()) return pending(result, 'setup_required', 'SUPPORT_DWS_SKILLS_INCOMPLETE', 'openxiangda support bootstrap --force');
        persist({ skillsVersion: version, skillsTarget: target });
      }
    }
    result.skills = { ready: referencesPresent(), bundle: saved.skillsVersion === version ? 'official-full-multi' : 'not_verified' };
    let channel;
    try { channel = await channelLoader(); } catch (error) { return pending(result, 'channel_unavailable', error.code || 'SUPPORT_CHANNEL_UNAVAILABLE', 'openxiangda support status'); }
    result.channel = { id: channel.id, name: channel.name, revision: channel.revision, corpId: channel.corpId, conversationId: channel.conversationId };
    const json = async command => {
      const output = await run('dws', [...command, '--format', 'json']);
      if (output.status !== 0) return null;
      try { const parsed = JSON.parse(output.stdout); return parsed?.error || parsed?.success === false ? null : parsed; } catch { return null; }
    };
    const listProfiles = async () => {
      const data = await json(['profile', 'list']);
      return Array.isArray(data?.profiles) ? data.profiles : [];
    };
    let profile = selectSupportProfile(await listProfiles(), channel.corpId, requested || saved.profile);
    if (action === 'login') {
      const loginProfile = profile?.profile || requested || channel.corpId;
      const login = await run('dws', ['auth', 'login', '--profile', loginProfile, ...(args.includes('--device') ? ['--device'] : []), '--format', 'json'], { timeout: 180_000, interactive: true });
      if (login.status !== 0) return pending(result, 'authorization_required', 'SUPPORT_AUTH_PENDING', 'openxiangda support login');
      profile = selectSupportProfile(await listProfiles(), channel.corpId, requested || saved.profile);
    }
    if (!profile) return pending(result, 'profile_required', 'SUPPORT_PROFILE_REQUIRED', 'openxiangda support login');
    result.profile = profile.profile;
    const auth = await json(['auth', 'status', '--profile', profile.profile]);
    if (!auth || auth.authenticated !== true || auth.token_valid !== true) return pending(result, 'authorization_required', 'SUPPORT_AUTH_REQUIRED', 'openxiangda support login');
    if (auth.corp_id !== channel.corpId || auth.user_id !== profile.userId) return pending(result, 'profile_required', 'SUPPORT_AUTH_IDENTITY_MISMATCH', 'openxiangda support status --profile <corpId:userId>');
    if (action !== 'status') persist({ profile: profile.profile });
    result.authorization = { verified: true };
    const group = await json(['chat', '+chat-members-list', '--conversation-id', channel.conversationId, '--member-types', 'user', '--page-limit', '1', '--profile', profile.profile]);
    if (group?.conversationId === channel.conversationId && Array.isArray(group.users) && group.users.length > 0 && !(group.failures?.length) && !(group.buckets?.users?.failures?.length)) {
      result.group = { access: 'verified', membership: 'not_independently_verified', organizationRestriction: 'not_independently_verified', complete: group.complete === true };
      result.state = result.skills.ready ? 'ready' : 'setup_required';
      if (!result.skills.ready) result.nextActions = [{ command: 'openxiangda support bootstrap' }];
      return result;
    }
    result.group = { access: 'unverified', membership: 'unverified', organizationRestriction: 'not_independently_verified' };
    if (action === 'join') {
      const opened = overrides.openUrl ? await overrides.openUrl(channel.inviteUrl) : await openSupportUrl(channel.inviteUrl, run);
      result.inviteUrl = channel.inviteUrl;
      result.browserOpened = opened === true;
      return pending(result, 'pending_user_action', 'SUPPORT_JOIN_PENDING', 'openxiangda support status');
    }
    return pending(result, 'group_unavailable', 'SUPPORT_GROUP_ACCESS_UNVERIFIED', 'openxiangda support join');
  } catch (error) {
    return pending(result, 'unavailable', error.code || 'SUPPORT_UNAVAILABLE', 'openxiangda support bootstrap');
  } finally { releaseLock(); }
}

function pending(result, state, code, command) {
  return { ...result, state, code, nextActions: [{ command }] };
}

export function installSupportGuidance(packageRoot, skillsHome) {
  const source = join(packageRoot, 'launcher-skill', 'openxiangda-support');
  mkdirSync(skillsHome, { recursive: true });
  cpSync(source, join(skillsHome, 'openxiangda-support'), { recursive: true });
}

export async function bootstrapSupport(packageRoot, args = [], overrides = {}) {
  if (args.includes('--skip-support') || args.includes('--dry-run') || args.includes('--help') || args.includes('-h')) return { state: 'skipped' };
  return supportOperation(packageRoot, ['support', 'bootstrap', ...(args.includes('--force') ? ['--force'] : [])], overrides);
}

async function openSupportUrl(url, run) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  return (await run(command, [url], { timeout: 10_000 })).status === 0;
}

export function runSupportProcess(command, args, options = {}) {
  return new Promise(resolve => {
    let stdout = '', stderr = '', settled = false, outputSize = 0;
    const env = { ...process.env };
    if (options.officialSkills) delete env.DWS_SKILL_SOURCE;
    const child = spawn(command, args, { env, stdio: options.interactive ? ['inherit', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeout || 40_000);
    const finish = status => { if (!settled) { settled = true; clearTimeout(timer); resolve({ status, stdout, stderr }); } };
    const collect = stream => chunk => {
      outputSize += chunk.length;
      if (outputSize > 1024 * 1024) { child.kill('SIGKILL'); return; }
      if (stream === 'stdout') stdout += chunk; else stderr += chunk;
      if (options.interactive) process.stderr.write(chunk);
    };
    child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
    child.once('error', () => finish(-1)); child.once('close', code => finish(code ?? -1));
  });
}
