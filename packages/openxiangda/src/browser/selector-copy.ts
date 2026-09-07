export function mobileReferenceSelectorCopy(placeholder: string) {
  const normalized = String(placeholder || "").trim();
  const prefixes = ["搜索并选择", "请选择", "选择"];
  const prefix = prefixes.find(item => normalized.startsWith(item));
  const subject = (prefix ? normalized.slice(prefix.length) : normalized).trim();
  const target = subject || "记录";
  return {
    title: `选择${target}`,
    empty: `请选择${target}`,
    search: `搜索${target}`,
  };
}
