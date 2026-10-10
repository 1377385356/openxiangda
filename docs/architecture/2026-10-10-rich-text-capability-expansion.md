# 统一富文本与受管媒体升级

状态：用户已授权直接升级 V2 平台和应用；实现及发布证据随交付更新。

## 证据与选型

V2 2.60.1 标准控件是 contentEditable/execCommand，仅提供基础强调、列表、链接和图片。
浏览器、Native 写入与公共投影分别维护窄白名单，删除 style、span、上下标、分隔线、待办和视频。
本地复现当前服务器 sanitize-html 策略后，格式样本只剩纯段落与列表；此证据不是线上原请求验证。

采用 Tiptap 3.31.4 / ProseMirror，精确锁定 MIT 核心与免费扩展。官方 TextStyle、Table、TaskList、
TextAlign、上下标等扩展能够覆盖本次需求，平台自行实现有界缩进和受管媒体节点。
React peer 支持 19；不引入付费协作、AI、云存储或 iframe 嵌入。

| 候选 | 调查证据与结论 |
| --- | --- |
| Tiptap | 官方 MIT LICENSE；Schema/节点可扩展，HTML 输入输出，推荐并实施 |
| wangEditor 5 | npm 5.1.23 最后修改于 2022-11-14；现成中文工具栏但维护较旧 |
| wangEditor Next | MIT 活跃衍生版本，可作为应用外部组件，仍须遵守统一 HTML 协议 |
| Lexical | 节点和更新模型成熟；工具栏、HTML、媒体仍需较多平台组装 |
| CKEditor 5 | 官方文档明确 GPL 2+ 或商业许可，私有平台需评估许可；本轮不选 |
| Quill | Delta 适合简洁编辑，本次复杂版式和受管结构集成成本较高 |

资料：https://tiptap.dev/docs/editor/extensions/marks/text-style 、
https://raw.githubusercontent.com/ueberdosis/tiptap/main/LICENSE.md 、
https://ckeditor.com/docs/ckeditor5/latest/getting-started/licensing/license-and-legal.html 。

## 所有者与不变量

主题仅为 V2 text.rich 统一富文本及受管媒体。contracts 唯一拥有版本化格式规则；Field Kit
拥有编辑生命周期；Native Managed File 唯一拥有上传、归属、引用、授权读取和清理。
继续保存 HTML 字符串，默认升级所有 text.rich，不加 opt-in、双 profile 或第二套 JSON 数据库。
V1 编辑器与数据不参与。平台默认控件使用 Tiptap，应用可选其他编辑器或包，但提交相同协议。

前端、服务端写入、回填和公开路径重写消费同一 contracts/rich-text 模块，以 HTML5 解析器
parse5 执行统一清洗和序列化；无 DOMParser 时也清洗。能力 data.rich-text 声明策略版本，
编译器自动要求此能力，旧平台不能接受新应用制品。格式规则不由应用提交或修改。

## 格式与安全资源边界

支持段落、标题、引用、代码、基础强调、span、上下标、分割线、有序/无序/待办列表、
表格和受管图片/视频。CSS 仅保留对齐、缩进、字号、字体、行高、文字/背景颜色及有限表格
尺寸/边框；逐属性枚举或数值上下界校验，禁止 URL、表达式、变量、事件、脚本、SVG、iframe。
链接仅 http/https/mailto/tel，强制 rel；图片视频仅平台 canonical 路径。
外链媒体和不受支持的标签/属性由清洗器删除；受管路径被识别后，引用归属不符则拒绝事务。
HTML 上限仍为 1 MiB，树深和节点数有界；图片20张、10MiB/张，视频4个、100MiB/个，MP4/WebM。
视频不承诺转码或所有客户端编解码器支持；不支持远程视频、自动播放、字幕和 poster 外链。
上传同时校验声明 MIME/扩展、真实容器头及大小，不能只相信浏览器 MIME。

视频复用现有字段上传和引用表，不新增存储权威。授权内容路由每次检查权限，增加单区间
HTTP Range/206/416 与流式 storage range 读取；浏览器同源 Cookie 请求播放，禁止全视频 blob
下载和把临时 OSS 签名 URL 写入字段。匿名公开读取仍按原策略与行权限授权后读取区间。
跨资源发布通过既有 copyManagedFile 的幂等回执为 text.rich 复制独立资产，并重写 HTML file ID；
不借用源资源路径。立即/定时发布都消费同一复制和投影能力。

## 失败与并发

清洗是确定性幂等转换，格式在编辑器输出→写入→再次保存→投影链路稳定。上传失败保留文字；
恢复回调只能插入一次，资源/任务切换使过期回调失效。媒体超限、失效引用、类型不符、跨应用/
资源/字段引用按原事务和引用绑定拒绝，不绕过事件或幂等键。文件复制保留原租户、环境、
字段对、RLS、Head、幂等回执与失败重试语义，不修改源文件。Range 多区间拒绝并有长度上限，
客户端断开释放上游流；不得在应用服务器缓存无界媒体。现有清理负责取消/孤立上传。
记录写入同步核验全部 rich 字段的受管引用；存量失效、异字段或跨范围引用必须先修复，
不能在修改其他字段时继续保留不合法引用。

## 配套发布与回滚

contracts/根包/声明编译器正式 Changeset 与配套服务器一起发布；严格校验能力和 validatorDigest，
不添加未声明 capabilities 字段。无业务表变更时不加 SQL。升级平台后应用安装精确 SDK 并切标准
Field Kit；旧存量基础 HTML仍可读。已经保存丰富格式后回退旧清洗器会在下次保存丢格式，故回滚
应停止新编辑并保留新服务端读取/清洗能力，应用引擎可以独立回退，不能宣称无损全栈降级。

## 可证伪验证

- 同源 Node/浏览器清洗对对齐、缩进、字体、字号、行高、颜色、上下标、待办、表格、链接和表情
  roundtrip 幂等；恶意 HTML、mXSS、CSS、外链及超限输入不能变成可执行内容。
- 真实 Tiptap PC/390px 移动编辑、撤销/重做、粘贴、保存回填及 media 生命周期；禁用/任务切换
  不误插入，宿主页面样式不被重置。
- Native 写入、草稿和任务绑定、引用投影、复制回执及公开重写保留格式；类型/权限不符拒绝。
- Range首段/尾段/后缀、越界、多区间、If-Range、If-None-Match、无权限与断连；各存储 provider
  的区间读取不会整文件缓冲。
- 发布官方候选通过 verify:release；匹配平台和应用部署读回版本，学校保存/回填/发布结果
  单独记录，不能以本地 fixture 或包构建当线上验收。
