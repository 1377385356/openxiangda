export function resolveDockerPublishedPort(
  runCaptured,
  containerName,
  containerPort
) {
  const portOutput = outputOf(
    runCaptured("docker", ["port", containerName, containerPort])
  );
  const directPort = /:(\d+)\s*$/.exec(portOutput)?.[1];
  if (isPort(directPort)) return directPort;

  const inspectOutput = outputOf(
    runCaptured("docker", [
      "inspect",
      "--format",
      "{{json .NetworkSettings.Ports}}",
      containerName,
    ])
  );
  let bindings;
  try {
    bindings = JSON.parse(inspectOutput);
  } catch {
    return null;
  }
  const inspectedPort = bindings?.[containerPort]?.[0]?.HostPort;
  return isPort(inspectedPort) ? String(inspectedPort) : null;
}

function outputOf(result) {
  if (typeof result === "string") return result.trim();
  return String(result?.stdout || "").trim();
}

function isPort(value) {
  if (!/^\d+$/.test(String(value || ""))) return false;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 65535;
}
