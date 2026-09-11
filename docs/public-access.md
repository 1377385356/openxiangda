# 匿名公开访问

OpenXiangda 2.0 支持没有平台账号的外部访客打开一个明确公开的用户页面，保存并续填草稿、
上传平台托管附件、执行具名重复校验、正式提交，并在同一浏览器中查看自己已提交的列表和详情。
应用也可以显式发布某个资源的部分记录字段，让外部浏览器分页查询公开记录或读取一条公开记录。

该能力识别的是“持有同一个平台 HttpOnly 浏览器凭证的访问者”，不是经过实名验证的自然人。
清除 Cookie、无痕模式、另一浏览器或另一设备都会成为新的匿名访问者，不能找回原草稿和记录。
微信、钉钉、短信/邮箱验证及自动创建平台账号不属于当前合同。

## 适用场景

- 访客预约、外部报名、新生信息采集等无账号表单；
- 填写过程较长，需要同一浏览器稍后继续；
- 需要上传照片或附件；
- 需要判断身份证号、手机号或业务编号等字段组合是否已存在；
- 提交后需要在同一浏览器查看自己的历史记录和详情。

如果业务需要跨设备恢复、确认真实身份或账号转换，应设计单独的可信身份接入，不能使用 IP、
User-Agent 或浏览器指纹猜测同一个人。

## 应用声明

资源仍然按普通 Native Resource 声明。公开能力只在一个静态 `surface: 'user'` 路由上增加一个
严格有界的 `frontend.publicAccess` 策略；同一路由可以按设备或资源声明多条策略，调用方必须带策略码：

```ts
export default defineOpenXiangdaApp({
  app: { code: 'visitor-app', name: '访客预约' },
  data: {
    resources: [{
      code: 'visitor-requests', name: '访客预约',
      fields: [
        { code: 'visitorName', label: '姓名', type: 'text.short', required: true },
        { code: 'phone', label: '手机', type: 'text.short', required: true, maxLength: 32 },
        { code: 'visitDate', label: '到访日期', type: 'date', required: true },
        { code: 'photo', label: '照片', type: 'image', file: { maxCount: 1, maxSizeMb: 5, accept: ['image/jpeg', 'image/png'] } },
      ],
    }],
  },
  frontend: {
    root: 'apps/web',
    routes: [
      {
        code: 'visitor-apply',
        path: '/visitor/apply',
        label: '访客预约',
        surface: 'user',
      },
    ],
    publicAccess: {
      policies: [
        {
          code: 'visitor-apply-public',
          routeCode: 'visitor-apply',
          mode: 'anonymous',
          resourceCode: 'visitor-requests',
          operations: [
            'draft.read',
            'draft.update',
            'validate',
            'create',
            'own.list',
            'own.read',
          ],
          fields: ['visitorName', 'phone', 'visitDate', 'photo'],
          requiredFields: ['visitorName', 'phone', 'visitDate'],
          ownRecordFields: ['visitorName', 'phone', 'visitDate', 'photo'],
          draft: {
            enabled: true,
            inactivityTtlSeconds: 2_592_000,
            maxBytes: 262_144,
          },
          validations: [
            {
              code: 'phone-unused',
              kind: 'duplicate',
              fields: ['phone'],
              result: 'availability',
            },
          ],
        },
      ],
    },
  },
});
```

公开路由不能同时声明 `capability` 或 `access`。策略只能引用同一个资源的已声明字段；公开创建
必须覆盖该资源所有可写必填业务字段。`pnpm openxiangda check --json` 会拒绝动态路由、越界字段、
缺失必填字段、未声明操作和非法重复校验。

附件、图片、多选等多值字段使用数组，存储不允许 null；这不意味着用户必须填写。上例照片可选，
可以省略或提交空数组，不放入 `requiredFields`。如果业务确实要求上传，资源字段声明 `required: true`，
公开策略也必须将它列入 `requiredFields`；提交时省略、null 或空数组都会被拒绝。策略可以提出更严格的
必填要求，但不能漏掉资源已有的必填业务字段。缺失覆盖的诊断会指出字段和 `fields`/`requiredFields` 路径。

操作按页面实际需要最小声明：

| 操作 | 含义 |
| --- | --- |
| `draft.read` | 读取同一浏览器当前有效草稿 |
| `draft.update` | 使用 revision CAS 保存当前草稿 |
| `validate` | 执行一个已声明的重复可用性校验，只返回 `available`/`duplicate` |
| `create` | 以幂等键正式提交当前草稿 |
| `own.list` | 分页查看同一浏览器正式提交的记录 |
| `own.read` | 查看同一浏览器的一条正式提交详情 |
| `public.list` | 分页查看当前策略明确发布的资源记录 |
| `public.read` | 读取当前策略明确发布的一条资源记录 |

`own.list` 和 `own.read` 不是一般查询权限。服务端固定注入匿名主体、当前公开策略和已提交草稿
回执条件，不接受调用方的 where、排序、投影或统计表达式。`public.list` 和 `public.read` 同样不是
一般查询权限：它们只读取策略绑定资源在当前租户、应用和环境下的记录，服务端固定按创建时间和 id
倒序分页，只返回 `publicRecordFields` 中显式列出的字段和记录 `id`。附件、图片和清洗后的富文本
通过平台托管文件路由公开，不返回对象存储地址。子表字段必须在 `publicSubtableFields` 中再次显式
列出子资源字段，服务端按声明顺序和行数上限返回一层子表数据。签名字段仍不公开。当前不支持调用方
筛选、排序、聚合或导出。

## `draft` 与公共读取

`draft` 是匿名提交的服务端事务载体，不是“外部访问”本身，也不是公共读取的前置条件。提交表单时，
平台需要先把不完整的输入保存到当前匿名浏览器的草稿，并用 `revision` 做并发控制；附件元数据绑定
到草稿；最终 `create` 会在同一数据库事务中锁定草稿、重新执行必填和重复校验、创建业务记录、标记
草稿已提交，并用幂等键保证不重复创建。因此声明 `create` 必须同时声明 `draft: { enabled: true }`，
而且同一策略的 `draft.read` 与 `draft.update` 必须成对出现。

公共只读场景不需要草稿。只声明 `public.list`/`public.read` 和 `publicRecordFields` 的策略可以直接
调用公共查询；它不会获得 `create`、`draft`、`own.*` 或普通 Native Data API 权限。不要为了查询已发布
数据创建一个“空草稿”，也不要把 `draft id` 传给浏览器。

例如，目录页面可以只发布明确选定的字段：

```ts
{
  code: 'catalog-public',
  routeCode: 'catalog',
  mode: 'anonymous',
  resourceCode: 'catalog-items',
  operations: ['public.list', 'public.read'],
  fields: ['name', 'category', 'available', 'internalNote'],
  publicRecordFields: ['name', 'category', 'available', 'items'],
  publicSubtableFields: { items: ['sku', 'quantity'] },
}
```

`publicRecordFields` 必须是 `fields` 和资源字段的子集；附件、图片和 `text.rich` 可公开，签名仍被
拒绝。公开子表字段必须配置 `publicSubtableFields`，其键是父资源的子表字段，值是子资源字段列表；
编译器会拒绝未声明字段、嵌套子表和缺少子字段投影。公共读取沿用明确公开的 `frontend.publicAccess`
路由和匿名浏览器凭证，不创建 guest 角色或虚拟内部用户。

需要隐藏停用、归档或租户标记记录时，使用固定 `publicFilters`，由服务端对每次 `public.list`/
`public.read` 强制追加。当前只支持最多 16 个不同字段的 `eq` 等值条件，字段必须属于策略的
`fields` 且仅允许布尔、文本、数值、日期和时间标量；调用方不能覆盖、追加或删除这些条件：

```ts
publicFilters: [{ field: 'enabled', operator: 'eq', value: true }]
```

匿名创建需要平台生成的不可预测字段时，使用 `serverGeneratedFields`。这些字段不属于
`fields`，调用方不能在草稿中写入；提交事务会由平台生成随机值并在提交回执的 `generated`
对象中返回。`random-token` 只适用于不承载身份信息的核验令牌等用途：

```ts
serverGeneratedFields: [{ field: 'qrToken', kind: 'random-token' }]
```

需要跨资源复核预约窗口等业务不变量时，可声明 `schedule`，绑定两个只读公开策略和资源字段。
平台会在最终创建事务中重新读取启用校区与规则，校验星期、日期范围、提前小时数和离散时段；页面端
校验只能改善体验，不能替代这次服务端复核。

子表中的文件引用会自动带上受控的 `resourceCode` 与父字段绑定；应用如需为附件生成下载地址，使用
`fileContentUrl(fileId, disposition, variant, resourceCode, parentFieldCode)`，不要自行拼接文件路径。

## 为什么不开放普通 Native Data API

普通 Native Data API 是内部或应用后端的可信数据边界，允许调用方提交
`select`、`where`、`order`、批量查询、聚合和导出，并按当前登录用户角色执行行列权限。匿名
公开发布的语义不同：它必须只绑定一个资源和不可变字段白名单，不接受调用方筛选、排序、聚合、
导出或自带角色，也必须把文件绑定到公开记录和公开字段后再读取。

直接把普通 Native Data API 暴露给浏览器会允许枚举内部资源和字段、通过筛选和计数推断未公开数据，
放大查询资源消耗，并增加文件 ID 猜测、审计字段泄露和权限合同混用的风险。因此公共端点继续是
专用的 `public.list`/`public.read`；底层可以复用 Native 的 RLS 和文件所有权校验，但不把 Native
Data API 的输入面开放给匿名调用方。

## 页面客户端

标准模板已经把生成的 `anonymousPublicAccess` 传给 `OpenXiangdaApplication`。页面通过正常的
`appRoutes` contribution 绑定，然后只使用 `openxiangda/react` 的专用客户端：

```tsx
import { createAnonymousPublicClient } from 'openxiangda/react';

const client = createAnonymousPublicClient({ routeCode: 'visitor-apply' });

const session = await client.bootstrap();
const draft = session.draft ?? await client.currentDraft();
const saved = await client.saveDraft(draft.revision, {
  visitorName,
  phone,
  visitDate,
});

const availability = await client.validate('phone-unused', { phone });
const photo = await client.upload('photo', file);
const withPhoto = await client.saveDraft(saved.revision, { photo });
const receipt = await client.submit(withPhoto.revision, crypto.randomUUID());

const page = await client.listOwn({ pageSize: 20 });
const detail = await client.getOwn(receipt.recordId);

// 只读公开目录不需要先读取或保存 draft。
const publicPage = await client.listPublic({ pageSize: 20 });
const publicDetail = await client.getPublic(publicPage.items[0].data.id as string);
```

必须先 `bootstrap()`。草稿更新始终使用最近返回的 revision，冲突时重新读取，不能覆盖写。
同一次不确定提交重试应复用同一个 idempotency key。提交前的重复检查只用于交互反馈；平台会在
最终事务中加锁并再次执行相同校验。

附件使用资源字段原有的 `file`/`image` 限制和平台托管上传。应用不能开放对象存储桶、发放匿名
对象存储凭证或自行拼接对象路径。

## 禁止绕过

- 不创建 guest 用户、访客角色或虚拟内部账号；
- 不让公开页面调用一般 Native Data API 或 NestJS CRUD；
- 不让浏览器提交 `created_by`、draft id 或任意查询条件；
- 不把匿名身份写入 localStorage；
- 不用 IP、User-Agent 或指纹确定数据所有权；
- 不通过关闭 JWT、匿名上传白名单或公开 bucket 解决附件权限。

## 验收矩阵

在预生产用真实浏览器至少验证：

1. 新浏览器可以打开精确公开路由、保存、刷新并续填草稿；
2. 已声明附件上传、预览和提交成功；
3. 重复校验只返回布尔语义，并发重复提交不能同时成功；
4. 同一浏览器能够查看自己的列表和详情；
5. 第二个浏览器列表为空，使用第一个浏览器的记录 id 得到 404；
6. 清除凭证后按设计失去原草稿和历史访问；
7. 未声明路由、字段、操作、校验和一般 Data API 全部拒绝；
8. 生产入口为 HTTPS，没有新增公开存储桶或匿名上传白名单。

开发与交付时按[检查与验收](./testing.md)保留跨浏览器正反证据。
