export function assertBootstrapReleaseCoupling(changesetSources) {
  const changesCli = changesetSources.some(source =>
    /["']openxiangda-cli["']\s*:/.test(source)
  );
  const changesRoot = changesetSources.some(source =>
    /["']openxiangda["']\s*:/.test(source)
  );
  if (changesCli && !changesRoot) {
    throw new Error(
      "CLI_BOOTSTRAP_ROOT_CHANGESET_REQUIRED: an openxiangda-cli release must " +
        "version the application-facing openxiangda root in the same release unit"
    );
  }
  if (changesRoot && !changesCli) {
    throw new Error(
      "ROOT_TEMPLATE_CLI_CHANGESET_REQUIRED: an openxiangda root release changes " +
        "the CLI packaged template pins and must version openxiangda-cli in the same release unit"
    );
  }
}

export function assertBootstrapVersionToken(source) {
  if (!source.includes("openxiangda@__OPENXIANGDA_VERSION__")) {
    throw new Error(
      "ROOT_BOOTSTRAP_VERSION_TOKEN_MISSING: Skill has no root-package version token"
    );
  }
  if (/openxiangda-cli@|openxiangda@(latest|alpha|next)\b/.test(source)) {
    throw new Error(
      "ROOT_BOOTSTRAP_MOVING_OR_PHYSICAL_COORDINATE_FORBIDDEN: Skill must use only the root-package version token"
    );
  }
  return source;
}
