import { Flags } from "@oclif/core";
import { spawn } from "node:child_process";
import { authorizeDeveloperSession } from "openxiangda-devkit-core";
import { OpenXiangdaCommand } from "../base.js";

export default class Login extends OpenXiangdaCommand {
  static summary = "通过平台浏览器授权登录 OpenXiangda 2.0";
  static flags = {
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
    const result = await authorizeDeveloperSession({
      baseUrl: flags["base-url"],
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
      workspace: { appCode: "global", root: process.cwd() },
      data: {
        session: {
          schemaVersion: result.session.schemaVersion,
          baseUrl: result.session.baseUrl,
          accessExpiresAt: result.session.accessTokenExpiresAt,
          refreshExpiresAt: result.session.refreshTokenExpiresAt,
          savedAt: result.session.savedAt,
          source: result.session.source,
        },
        identity: result.identity,
      },
      diagnostics: [],
      nextActions: [
        {
          code: "create",
          label: "创建应用",
          command: `openxiangda create <directory> --base-url '${result.session.baseUrl.replaceAll("'", `'"'"'`)}'`,
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
