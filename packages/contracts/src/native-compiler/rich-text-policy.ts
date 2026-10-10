/** V2 text.rich 的默认协议。应用不能提供另一份白名单。 */
export const RICH_TEXT_POLICY_V2 = Object.freeze({
  version: 'rich-text-html/1',
  maxBytes: 1024 * 1024,
  maxNodes: 25000,
  maxDepth: 128,
  maxImages: 20,
  imageMaxBytes: 10 * 1024 * 1024,
  maxVideos: 4,
  videoMaxBytes: 100 * 1024 * 1024,
  imageTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  videoTypes: ['video/mp4', 'video/webm'],
  fonts: ['Arial', 'Verdana', 'Tahoma', 'Times New Roman', 'Courier New', '宋体', '微软雅黑', 'SimSun', 'Microsoft YaHei', 'sans-serif', 'serif', 'monospace'],
} as const);
