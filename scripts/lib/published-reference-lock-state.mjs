export function unexpectedReferenceChanges(status) {
  return String(status || "")
    .split("\n")
    .filter(Boolean)
    .filter(line => !/^ M pnpm-lock\.yaml$/.test(line));
}
