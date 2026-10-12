# AppSpec 实际读取与预算反馈

## 问题、owner 与决定

当前 AppSpec 单文件/上下文正文均为256KiB、活动读取总量2MiB。超限文件在collect时被跳过，随后selector和引用层可能误报“未找到”。返回的省略摘要没有实际字节和原因；历史索引仅读front matter也缺少显式读取模式。

原AppSpec collector/parser/selector继续唯一拥有工作区文档、确认和digest；补当前操作的有界读取元数据，记录相对路径、实际字节、读取字节、全文/历史索引模式、不能读取或预算省略的原因。未成功解析的文件不发明metadata ID/REQ/确认。Selector按已发现路径提示不可用；实际缺文件仍保留原not-found。

## 不变量与边界

- 不提高原文件/总量/正文预算，不加外部存储或迁移状态。最多128条readback，每类超出明确计数与截断；优先保留本次selector/app.md事实。
- 使用普通文件descriptor有界读取并前后核对size/mtime；symlink、非常规文件、变化中/不可读、格式错误和超限分别报告，不暴露原文件正文或系统错误。
- 实际正文预算按UTF-8字节，保留原选择优先级；omitted附context-budget原因/actualBytes，requestedContentBytes表示预算前请求正文总量。并行修改造成未知时不形成有效确认或部署通过。
- metadata索引不是全文；历史确认/归档保留原语义。新的反馈字段是当前读回，不作为另一份工作区摘要缓存、验收记录或授权。
- V2不会读取1.x openspec；原TEST/生产AppSpec门禁不弱化。错误继续阻断对应正式交付，普通advisory路径保持。其他租户/生产没有写入。
- 回退为去除反馈字段与提示；文档原字节/ID/digest和原确认不变。

## 可证伪验证

真实临时工作区：81,602字节正常文档可读；UTF-8单文件超限准确输出actual/maximum，selector不误报缺失；多个文档的正文预算省略包含字节和原因；历史索引读模式有据；不存在、symlink、格式错误、文件数量/总量预算分别报告。原AppSpec确认/发布/归档及相关设计闭包套件保留，运行verify:affected一次；无npm/目标发行。
