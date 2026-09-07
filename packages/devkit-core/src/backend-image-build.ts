import { runCommandProcess } from './command-process.js';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { PlatformCapabilities } from "openxiangda-contracts";

const MAX_REPOSITORY_PREFIX_LENGTH = 200;
const MAX_REPOSITORY_PREFIX_SEGMENTS = 32;
const BACKEND_IMAGE_NETWORK_ATTEMPTS = 3;
const BACKEND_IMAGE_NETWORK_RETRY_DELAYS_MS = [250, 750] as const;
const REPOSITORY_COMPONENT = /^[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*$/;
const DOMAIN_COMPONENT = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;

export interface BackendImageBuildTarget {
  repository: string;
  platform: "linux/amd64";
}

export interface PublishedBackendImage extends BackendImageBuildTarget {
  digest: string;
  reference: string;
}

export class BackendImageBuildError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false
  ) {
    super(`${code}: ${message}`);
    this.name = "BackendImageBuildError";
  }
}

export function backendImageBuildTarget(
  capabilities: PlatformCapabilities,
  appCode: string
): BackendImageBuildTarget {
  const build = capabilities.deployment?.backendImageBuild;
  if (
    !build ||
    build.owner !== "developer-cli" ||
    typeof build.available !== "boolean" ||
    build.platform !== "linux/amd64"
  ) {
    throw new BackendImageBuildError(
      "OPENXIANGDA_BACKEND_IMAGE_BUILD_CONFIG_INVALID",
      "平台返回了不受支持的后端镜像构建合同"
    );
  }
  if (!build.available) {
    throw new BackendImageBuildError(
      "OPENXIANGDA_BACKEND_IMAGE_BUILD_UNAVAILABLE",
      "平台尚未配置可运行的应用后端镜像环境，请联系平台管理员配置后重试"
    );
  }
  const prefix = build.repositoryPrefix;
  if (
    typeof prefix !== "string" ||
    prefix.trim() !== prefix ||
    !validOciRepositoryPrefix(prefix)
  ) {
    throw new BackendImageBuildError(
      "OPENXIANGDA_BACKEND_IMAGE_REPOSITORY_INVALID",
      "平台返回的后端镜像 repositoryPrefix 不是安全的 OCI repository 前缀"
    );
  }
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(appCode)) {
    throw new BackendImageBuildError(
      "OPENXIANGDA_BACKEND_IMAGE_APP_CODE_INVALID",
      "应用代码不能用于后端镜像仓库"
    );
  }
  return {
    repository: `${prefix}/${appCode}-server`,
    platform: build.platform,
  };
}

function validOciRepositoryPrefix(value: string): boolean {
  if (
    !value ||
    value.length > MAX_REPOSITORY_PREFIX_LENGTH ||
    value !== value.toLowerCase() ||
    value.includes("://") ||
    /[@?#%\\\s]/.test(value)
  ) {
    return false;
  }

  const segments = value.split("/");
  if (
    segments.length > MAX_REPOSITORY_PREFIX_SEGMENTS ||
    segments.some(segment => !segment || segment === "." || segment === "..")
  ) {
    return false;
  }

  const [first, ...remaining] = segments;
  if (!first) return false;
  const explicitRegistry =
    first === "localhost" ||
    first.includes(".") ||
    first.includes(":") ||
    first.startsWith("[");
  if (explicitRegistry && !validRegistry(first)) return false;

  const repositorySegments = explicitRegistry ? remaining : segments;
  return repositorySegments.every(
    segment => REPOSITORY_COMPONENT.test(segment) && !segment.includes(":")
  );
}

function validRegistry(value: string): boolean {
  if (value.startsWith("[")) {
    const match = /^\[([^\]]+)\](?::([0-9]{1,5}))?$/.exec(value);
    return Boolean(match && isIP(match[1]!) === 6 && validPort(match[2]));
  }

  const match = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(value);
  if (!match || !validPort(match[2])) return false;
  const host = match[1]!;
  if (isIP(host) === 4) return true;
  return host.split(".").every(component => DOMAIN_COMPONENT.test(component));
}

function validPort(value: string | undefined): boolean {
  if (value === undefined) return true;
  const port = Number(value);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65535;
}

export async function publishBackendImage(input: {
  root: string;
  backendRoot: string;
  sourceRevision?: string;
  target: BackendImageBuildTarget;
  dockerExecutable?: string;
}): Promise<PublishedBackendImage> {
  const root = resolve(input.root);
  const dockerfile = resolve(root, input.backendRoot, "Dockerfile");
  const relativeDockerfile = relative(root, dockerfile);
  if (
    !relativeDockerfile ||
    relativeDockerfile.startsWith("..") ||
    isAbsolute(relativeDockerfile)
  ) {
    throw new BackendImageBuildError(
      "OPENXIANGDA_BACKEND_DOCKERFILE_OUTSIDE_WORKSPACE",
      "后端 Dockerfile 必须位于应用工作区内"
    );
  }
  if (!existsSync(dockerfile)) {
    throw new BackendImageBuildError(
      "OPENXIANGDA_BACKEND_DOCKERFILE_MISSING",
      `官方后端 Dockerfile 不存在: ${relativeDockerfile}`
    );
  }
  if (!existsSync(join(root, ".dockerignore"))) {
    throw new BackendImageBuildError(
      "OPENXIANGDA_DOCKERIGNORE_MISSING",
      "工作区缺少模板 .dockerignore，拒绝上传未受约束的构建上下文"
    );
  }

  const docker = input.dockerExecutable || "docker";
  const version = await runDocker(docker, ["buildx", "version"], root);
  if (version.error?.code === "ENOENT") {
    throw new BackendImageBuildError(
      "OPENXIANGDA_DOCKER_REQUIRED",
      "未找到 Docker CLI，请安装并启动 Docker Desktop"
    );
  }
  if (version.error || version.status !== 0) {
    throw new BackendImageBuildError(
      "OPENXIANGDA_DOCKER_BUILDX_REQUIRED",
      "当前 Docker CLI 未提供可用的 Buildx"
    );
  }

  const scratch = mkdtempSync(join(tmpdir(), "openxiangda-buildx-"));
  const metadataFile = join(scratch, "metadata.json");
  const revision = String(input.sourceRevision || "").toLowerCase();
  const sourceKey = /^[a-f0-9]{7,64}$/.test(revision)
    ? revision.slice(0, 12)
    : "local";
  const tag = `ox2-${sourceKey}-${randomUUID().slice(0, 8)}`;
  try {
    for (let attempt = 1; attempt <= BACKEND_IMAGE_NETWORK_ATTEMPTS; attempt += 1) {
      rmSync(metadataFile, { force: true });
      const built = await runDocker(
        docker,
        [
          "buildx",
          "build",
          "--file",
          dockerfile,
          "--platform",
          input.target.platform,
          "--provenance=false",
          "--tag",
          `${input.target.repository}:${tag}`,
          "--metadata-file",
          metadataFile,
          "--push",
          root,
        ],
        root
      );
      if (built.error?.code === "ENOENT") {
        throw new BackendImageBuildError(
          "OPENXIANGDA_DOCKER_REQUIRED",
          "未找到 Docker CLI，请安装并启动 Docker Desktop"
        );
      }
      if (!built.error && built.status === 0) break;

      const failure = buildFailure(built.output);
      if (
        failure.code !== "OPENXIANGDA_BACKEND_IMAGE_PUSH_FAILED" ||
        attempt === BACKEND_IMAGE_NETWORK_ATTEMPTS
      ) {
        if (
          failure.code === "OPENXIANGDA_BACKEND_IMAGE_PUSH_FAILED" &&
          attempt === BACKEND_IMAGE_NETWORK_ATTEMPTS
        ) {
          throw new BackendImageBuildError(
            failure.code,
            `后端镜像构建或推送连续 ${BACKEND_IMAGE_NETWORK_ATTEMPTS} 次遇到临时网络故障`,
            true
          );
        }
        throw failure;
      }
      await wait(BACKEND_IMAGE_NETWORK_RETRY_DELAYS_MS[attempt - 1] || 0);
    }
    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(readFileSync(metadataFile, "utf8"));
    } catch {
      throw new BackendImageBuildError(
        "OPENXIANGDA_BACKEND_IMAGE_DIGEST_MISSING",
        "Buildx 没有返回可解析的镜像 metadata digest"
      );
    }
    const digest = String(metadata["containerimage.digest"] || "").toLowerCase();
    if (!SHA256_DIGEST.test(digest)) {
      throw new BackendImageBuildError(
        "OPENXIANGDA_BACKEND_IMAGE_DIGEST_MISSING",
        "Buildx metadata 没有返回合法 sha256 镜像摘要"
      );
    }
    return {
      ...input.target,
      digest,
      reference: `${input.target.repository}@${digest}`,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function runDocker(executable: string, args: string[], cwd: string) {
  const environment = { ...process.env };
  delete environment.OPENXIANGDA_TOKEN;
  delete environment.OPENXIANGDA_BACKEND_IMAGE;
  const result = await runCommandProcess(executable, args, { cwd, env: environment });
  return {
    status: result.status,
    error: result.error as NodeJS.ErrnoException | undefined,
    output: result.output,
  };
}

function wait(delayMs: number) {
  return new Promise<void>(resolve => setTimeout(resolve, delayMs));
}

function buildFailure(output: string) {
  if (/cannot connect|daemon is not running|is the docker daemon running/i.test(output)) {
    return new BackendImageBuildError(
      "OPENXIANGDA_DOCKER_DAEMON_UNAVAILABLE",
      "Docker daemon 不可用，请启动 Docker Desktop 后重试",
      true
    );
  }
  if (/unauthorized|authentication required|requested access.*denied|denied:/i.test(output)) {
    return new BackendImageBuildError(
      "OPENXIANGDA_REGISTRY_AUTH_REQUIRED",
      "镜像仓库拒绝推送，请先在本机 Docker credential store 完成登录"
    );
  }
  if (
    /timeout|temporary failure|connection reset|econnreset|fetch failed|network is unreachable|unexpected eof|socket disconnected before secure tls|socket hang up|etimedout/i.test(
      output
    )
  ) {
    return new BackendImageBuildError(
      "OPENXIANGDA_BACKEND_IMAGE_PUSH_FAILED",
      "后端镜像构建或推送遇到临时网络故障",
      true
    );
  }
  return new BackendImageBuildError(
    "OPENXIANGDA_BACKEND_IMAGE_BUILD_FAILED",
    "后端镜像构建或推送失败；请检查官方 Dockerfile 与本机 Docker 状态"
  );
}
