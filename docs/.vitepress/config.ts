import { defineConfig } from 'vitepress';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../packages/openxiangda/package.json', import.meta.url), 'utf8')).version;
export default defineConfig({
  lang: 'zh-CN',
  title: 'OpenXiangda 2.0',
  description: '应用开发、平台能力、校验与部署的中文使用指南',
  lastUpdated: true,
  cleanUrls: true,
  srcExclude: ['architecture/**', 'architecture-decisions/**', 'design/**'],
  markdown: {
    config(md) {
      md.core.ruler.before('normalize', 'openxiangda-version', state => {
        state.src = state.src.replaceAll('__OPENXIANGDA_VERSION__', version);
      });
    },
  },
  themeConfig: {
    search: { provider: 'local' },
    nav: [
      { text: '开始', link: '/getting-started' },
      { text: '开发', link: '/development' },
      { text: '校验与部署', link: '/testing' },
      { text: '工具参考', link: '/reference/cli' },
    ],
    sidebar: [
      { text: '开始与开发', items: [
        { text: '总览', link: '/' },
        { text: '安装与开始开发', link: '/getting-started' },
        { text: '对话发现与产品设计', link: '/product-design' },
        { text: '页面交互模式与评审', link: '/interaction-patterns' },
        { text: '需求与开发流程', link: '/development' },
        { text: '架构与能力所有者', link: '/concepts' },
        { text: '需求、设计与交付记录', link: '/appspec' },
      ] },
      { text: '实现业务', items: [
        { text: '模型与标准 CRUD', link: '/application-foundation' },
        { text: '页面与组件扩展', link: '/frontend' },
        { text: '字段与移动控件', link: '/field-components' },
        { text: '数据与权限', link: '/data-authz' },
        { text: '匿名公开访问', link: '/public-access' },
        { text: '审批、事件与通知', link: '/workflow-events' },
        { text: '按需后端', link: '/backend' },
        { text: '应用管理', link: '/administration' },
      ] },
      { text: '校验与交付', items: [
        { text: '检查与真实业务验收', link: '/testing' },
        { text: '部署与恢复', link: '/delivery' },
        { text: '升级与资料刷新', link: '/upgrading' },
      ] },
      { text: '工具参考', items: [
        { text: 'CLI', link: '/reference/cli' },
        { text: 'MCP', link: '/reference/mcp' },
      ] },

    ],
  },
});
