import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// 自动化协议测试的业务输入，不作为真实线上验收证据。
export function writeDevelopmentFixture(root, appCode, changeId = 'initial-delivery') {
  mkdirSync(join(root, 'appspec/changes/active'), { recursive: true });
  writeFileSync(join(root, 'appspec/app.md'), `---
schema: openxiangda.appspec/app/v1
app: ${appCode}
title: 仪器目录验收应用
status: active
---
# 仪器目录验收应用

## 业务目标
成员查找可用仪器，管理员维护清单并保持数据一致。

## 角色
管理员维护目录，普通成员只能查看授权范围中的仪器。

## 架构与数据关系
仪器是独立模型，使用平台 Data API、标准字段和角色并集，不引入自定义身份或权限状态。

## 业务任务与页面
管理端维护仪器目录；PC 与移动入口提供成员查询，辅助配置不单独建页面。

## 权限矩阵与确认
管理员具备授权目录的新增修改删除权限，成员只读；直接写请求与隐藏页面均验证拒绝路径。

## 性能与容量预算
本轮协议夹具只有一条仪器，业务目标列表每页 20 条，查询上限 100 条，验收目标两秒内返回。线上容量需另行测量。

## 当前有效规则
### REQ-APP-001 成员查询目录
成员只能查看授权仪器，平台拒绝未经授权的写入。
#### AC-APP-001 查询授权仪器
成员读取可见目录并验证被禁止的写入返回拒绝。

## 未确认问题
- 无。
`);
  writeFileSync(join(root, `appspec/changes/active/${changeId}.md`), `---
schema: openxiangda.appspec/change/v1
id: ${changeId}
title: 首次仪器目录交付
status: implementing
currentSpec: pending
risk: L1
capabilities: []
requirements: []
resources: []
actions: []
decisions: []
documents: [DES-REVIEW-INITIAL]
---
# 首次仪器目录交付

## 为什么
验证发布链路能交付一个具备明确读写边界的仪器目录。

## 需求依据
本记录是自动化测试固定输入，业务要求来自测试场景，不能当作用户线上确认。

## 方案与影响
复用平台模型、标准 CRUD 和登录能力，前端只消费生成契约，不改变平台权限所有者。

## 任务与实现
REQ-APP-001 对应 openxiangda.config.ts 的目录声明与 AC-APP-001，先检查再部署测试环境。

## 性能与容量预算
沿用总纲的每页二十条和两秒返回目标；本夹具不证明真实生产容量。

## 验收
### REQ-APP-001 成员查询目录
#### AC-APP-001 查询授权仪器
成员打开目录，读取授权仪器，返回名称；写操作必须被平台拒绝。

## 验证与发布
由自动化协议测试记录结果，真实线上业务验收在独立测试环境另行执行。

## 交接
稳定目录规则保存在应用总纲，后续变化必须核对权限和查询预算。

## 未确认问题
- 无。
`);
  writeDesignFixture(root, appCode);

}

export function writeVerificationFixture(root, run, changeId = 'initial-delivery') {
  mkdirSync(join(root, 'appspec/verification'), { recursive: true });
  writeFileSync(join(root, 'appspec/verification/protocol-fixture.txt'), '自动化协议输入：授权与拒绝、计时断言；不是线上业务验收。\n');
  const report = {
    schemaVersion: 'openxiangda.business-verification/v1', appCode: run.appCode,
    changeId, sourceDeploymentId: run.id, packageDigest: run.packageDigest,
    recordedAt: '2026-09-06T08:00:00.000Z',
    scenarios: [{ id: 'AC-APP-001', status: 'passed', actor: '成员测试身份', observation: '协议夹具返回授权仪器名称，拒绝其他角色写入。', evidence: ['appspec/verification/protocol-fixture.txt'] }],
    performance: [{ scenario: '仪器目录第一页查询', sample: '协议夹具的一条仪器数据', targetMs: 2000, observedMs: 10, evidence: ['appspec/verification/protocol-fixture.txt'] }],
  };
  writeFileSync(join(root, `appspec/verification/${run.id}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export function writeDesignFixture(root, appCode) {
  const specs = [
    ['product/product.md', 'DES-PRODUCT', 'product', {
      '目标与范围': '协议夹具仅管理仪器目录和授权查询，不引入预约、收费或审批。',
      '角色与任务': '普通成员查询授权仪器，管理员维护仪器目录与可见范围。',
      '模块与取舍': '目录维护和成员查询覆盖本期任务；预约和统计无此需求。',
      '业务规则': '成员只读，管理员在平台授权范围内维护，服务端拒绝越权。',
      '验收标准': 'AC-APP-001 定义于总纲：成员查询成功且越权写入被拒绝。',
    }],
    ['experience/journey.md', 'DES-JOURNEY', 'journey', {
      '角色与场景': '成员从已登录应用查找仪器，管理员在电脑上维护授权目录。',
      '主流程与交接': '成员进入目录、筛选、打开详情、返回列表；本期无需人员交接。',
      '异常与恢复': '查询失败保留条件并允许重试；无权限展示拒绝且不返回记录。',
      '页面与入口': '目录列表和仪器详情使用标准 CRUD 模式，手机使用对应移动组件。',
    }],
    ['experience/catalog.md', 'DES-PAGE-CATALOG', 'page', {
      '任务与入口': '目录页从应用导航进入，详情返回保留筛选和页码，成功出口为查到所需仪器。',
      '信息与字段': '名称优先、状态次之，每页二十条；长名称截断后可在详情查看。',
      '操作与反馈': '成员只有查询与详情，管理员编辑成功后更新列表并保留筛选。',
      '页面状态': '首次加载使用组件加载态，无记录说明尚未配置，筛选为空允许清空条件；失败保留筛选并重试。',
      '写入与恢复': '成员无写入态；管理员提交中禁止重复点击，明确失败保留输入，未知结果先读回原记录，冲突提示重新载入。',
      '权限与多端': '成员隐藏写入且 API 拒绝；PC 标准表格、手机任务卡片与详情，键盘和返回遵循组件约定。',
      '原型与验收': '沿用标准目录和详情模式，检查筛选返回、授权查询与拒绝路径，使用 AC-APP-001。',
    }],
    ['design/visual.md', 'DES-VISUAL', 'visual', {
      '界面模式': '使用平台标准 CRUD 和 Field Kit，保持 Ant Design 默认外观。',
      '布局与多端': 'PC 使用列表和详情，移动优先名称及状态卡片，主操作随实际权限展示。',
      '原型与状态': '本协议夹具引用标准目录模式；真实应用仍需目标端走查状态和任务完成。',
      '可访问性': '标准控件具有标签与键盘焦点，错误关联字段，状态不只用颜色表示。',
    }],
    ['design/permissions.md', 'DES-PERMISSIONS', 'permissions', {
      '角色与范围': '普通成员读取已授权仪器，管理员维护自己的授权范围，不添加跨部门隐式权限。',
      '页面与操作': '成员只读列表详情，管理员按平台声明获得新增、编辑、删除权限。',
      '行与字段': '由平台行权限控制可见记录，前端不执行跨范围全量获取，字段按合同展示。',
      '多角色与反例': '使用平台角色并集；仅成员身份直接调用写请求必须拒绝，菜单隐藏不能作为授权。',
    }],
    ['design/architecture.md', 'DES-ARCHITECTURE', 'architecture', {
      '所有者与边界': '平台拥有身份、数据与权限，应用只声明目录模型和任务入口。',
      '模型与状态': '仪器为独立模型，此夹具无审批状态，不建立辅助审批数据源。',
      '契约与能力': '普通 CRUD 使用平台 Data API，字段和客户端消费生成合同，本期不启用 Nest。',
      '失败与并发': '编辑冲突由写契约裁定，结果未知先读回，不发起新随机标识的重复写入。',
      '容量与回滚': '列表每页二十条、上限一百条；延迟目标两秒，回滚复用平台上一成功版本。',
    }],
  ];
  const documents = specs.map(([file, id, type, sections]) => {
    const path = `appspec/${file}`;
    const content = `---\nschema: openxiangda.appspec/design/v1\nid: ${id}\ntitle: 协议测试设计材料\nstatus: confirmed\ntype: ${type}\ndocuments: []\n---\n# 协议测试材料（非真实用户确认）\n\n${Object.entries(sections).map(([title, body]) => `## ${title}\n${body}\n`).join('\n')}\n## 未确认问题\n- 无。\n`;
    mkdirSync(join(root, 'appspec', file.split('/')[0]), { recursive: true });
    writeFileSync(join(root, path), content);
    return { id, path, content };
  });
  const baseline = [...documents, { id: appCode, path: 'appspec/app.md', content: readFileSync(join(root, 'appspec/app.md'), 'utf8') }].sort((a, b) => a.id.localeCompare(b.id));
  const digest = createHash('sha256').update(JSON.stringify(baseline)).digest('hex');
  mkdirSync(join(root, 'appspec/reviews'), { recursive: true });
  writeFileSync(join(root, 'appspec/reviews/initial.md'), `---
schema: openxiangda.appspec/design/v1
id: DES-REVIEW-INITIAL
title: 协议测试评审
status: confirmed
type: review
scope: initial
documents: [${documents.map(item => item.id).join(', ')}]
baselineDigest: ${digest}
confirmedBy: 自动化协议夹具（非真实用户）
confirmedAt: 2026-09-07T01:00:00Z
confirmationSource: 自动化测试构造的受评设计和确认元数据，仅验证协议，不代表真实用户答复
---
# 协议测试评审

## 范围与覆盖
本次完整覆盖仪器目录的查询和维护任务，包含 PC 与移动标准模式，不启用审批或预约。

## 一致性评审
按成员查询、管理员维护及越权拒绝核对权限、页面、架构和 AC-APP-001，均由本协议测试构造。

## 用户确认
此处是自动化协议输入，没有发生真实业务用户确认，不能用于线上交付或真实证据。

## 未确认问题
- 无。
`);
  return { digest, documents };
}
