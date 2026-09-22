export function isDirectorySearchKeyword(value: string): boolean {
  const query = value.trim();
  return query.length <= 64 && (query.length >= 2 || /^\p{Script=Han}$/u.test(query));
}

export const directorySearchKeywordHint = '请输入一个汉字或 2–64 个字符';
