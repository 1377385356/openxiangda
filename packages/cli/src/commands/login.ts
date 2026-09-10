import { Flags } from "@oclif/core";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { authorizeDeveloperSession, defaultSessionPath, normalizePlatformBaseUrl, workspaceSessionPath } from "openxiangda-devkit-core";
import { OpenXiangdaCommand, workspaceFlags } from "../base.js";

export default class Login extends OpenXiangdaCommand {
  static summary = "通过平台浏览器授权登录 OpenXiangda 2.0";
  static flags = {
    ...workspaceFlags,
    "base-url": Flags.string({
      required: true,
      env: "OPENXIANGDA_BASE_URL",
      summary: "平台 service 基地址",
    }),
    "no-open": Flags.boolean({
      summary: "不自动打开浏览器",
    }),
  };

  async run() {
    const { flags } = await this.parse(Login);
    const sessionPath = flags.cwd ? workspaceSessionPath(flags.cwd) : defaultSessionPath();
    const root = dirname(dirname(sessionPath));
    const linkPath = join(root, '.openxiangda', 'link.json');
    if (existsSync(linkPath)) {
      const link = JSON.parse(readFileSync(linkPath, 'utf8'));
      if (link.baseUrl && normalizePlatformBaseUrl(link.baseUrl) !== normalizePlatformBaseUrl(flags['base-url'])) {
        throw new Error('OPENXIANGDA_PLATFORM_SESSION_MISMATCH: 登录平台与工作区绑定不一致，请使用该工作区的原平台地址');
      }
    }
    const result = await authorizeDeveloperSession({
      baseUrl: flags["base-url"],
      sessionPath,
      onAuthorization: async authorization => {
        if (!this.jsonEnabled()) {
          this.log(`请在浏览器确认授权：${authorization.loginUrl}`);
        }
        if (!flags["no-open"]) this.openBrowser(authorization.loginUrl);
      },
    });
    return this.present({
      ok: true,
      operation: "login",
      workspace: { appCode: "unbound", root },
      data: {
        session: {
          schemaVersion: result.session.schemaVersion,
          baseUrl: result.session.baseUrl,
          accessExpiresAt: result.session.accessTokenExpiresAt,
          refreshExpiresAt: result.session.refreshTokenExpiresAt,
          savedAt: result.session.savedAt,
          source: result.session.source,
          path: result.session.path,
          scope: result.session.scope,
        },
        identity: result.identity,
      },
      diagnostics: [],
      nextActions: [
        {
          code: "create",
          label: "创建应用",
          command: `openxiangda create '${root.replaceAll("'", `'"'"'`)}' --base-url '${result.session.baseUrl.replaceAll("'", `'"'"'`)}'`,
        },
      ],
    });
  }

  private openBrowser(url: string) {
    const command =
      process.platform === "darwin"
        ? { file: "open", args: [url] }
        : process.platform === "win32"
          ? { file: "cmd", args: ["/c", "start", "", url] }
          : { file: "xdg-open", args: [url] };
    try {
      const child = spawn(command.file, command.args, {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", () => undefined);
      child.unref();
    } catch {
      // The human-readable URL remains visible if a browser cannot be opened.
    }
  }
}
