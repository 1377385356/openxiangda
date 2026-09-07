const DEFAULT_FETCH_TIMEOUT_MS = "30000";
const DEFAULT_FETCH_RETRIES = "2";
const DEFAULT_FETCH_RETRY_MIN_TIMEOUT_MS = "1000";
const DEFAULT_FETCH_RETRY_MAX_TIMEOUT_MS = "5000";

export function releaseNpmEnvironment(environment = process.env) {
  return {
    ...environment,
    NPM_CONFIG_FETCH_TIMEOUT: configured(
      environment,
      "NPM_CONFIG_FETCH_TIMEOUT",
      "npm_config_fetch_timeout",
      DEFAULT_FETCH_TIMEOUT_MS
    ),
    NPM_CONFIG_FETCH_RETRIES: configured(
      environment,
      "NPM_CONFIG_FETCH_RETRIES",
      "npm_config_fetch_retries",
      DEFAULT_FETCH_RETRIES
    ),
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT: configured(
      environment,
      "NPM_CONFIG_FETCH_RETRY_MINTIMEOUT",
      "npm_config_fetch_retry_mintimeout",
      DEFAULT_FETCH_RETRY_MIN_TIMEOUT_MS
    ),
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT: configured(
      environment,
      "NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT",
      "npm_config_fetch_retry_maxtimeout",
      DEFAULT_FETCH_RETRY_MAX_TIMEOUT_MS
    ),
  };
}

export function registryCommandOutput(result) {
  return `${result?.stdout || ""}\n${result?.stderr || ""}\n${
    result?.error?.message || ""
  }`;
}

export function isTransientRegistryFailure(output) {
  return /(?:\b(?:500|502|503|504)\b|ERR_PNPM_FETCH_5\d\d|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket disconnected before secure TLS|socket hang up|network is unreachable|unexpected eof)/i.test(
    String(output || "")
  );
}

export async function runTransientRegistryOperation(
  operation,
  {
    attempts = 5,
    delaysMs = [250, 750, 1500, 3000],
    onRetry = () => {},
  } = {}
) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new Error("RELEASE_NETWORK_ATTEMPTS_INVALID");
  }
  let result;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = await operation(attempt);
    if (result?.status === 0) return { result, attempts: attempt };
    const output = registryCommandOutput(result);
    if (!isTransientRegistryFailure(output) || attempt === attempts) {
      return { result, attempts: attempt };
    }
    onRetry({ attempt, nextAttempt: attempt + 1, attempts });
    await new Promise(resolve => setTimeout(resolve, delaysMs[attempt - 1] || 0));
  }
  return { result, attempts };
}

function configured(environment, upper, lower, fallback) {
  return String(environment[upper] || environment[lower] || fallback);
}
