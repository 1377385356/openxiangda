# npm 元数据快照与渠道推进

证据：计划逐包串行查询版本存在性和历史；planned receipt又逐包查询渠道。写入阶段root可能排在依赖前，publish隐式写latest后再重复写latest标签。

所有者：原artifact manifest负责冻结tarball，原receipt负责阶段与每包priorTags/channelPolicy；registry仍权威。新增元数据快照只是当前查询投影，不跨候选/进程缓存，不代替写入前后新鲜integrity/渠道门禁。

合同：只读versions/dist-tags可独立批量查询，默认三并发、最多四，七包allowlist；pack、npm publish与dist-tag写仍按原owner串行。候选及渠道按实际公开包依赖拓扑推进，根包最后；循环依赖拒绝，不声称七包原子。receipt显式列出每标签旧值/目标；当前已经等于目标的标签不重写，实际旧值既非原值也非目标时停止。

失败/并发：404才代表未发布包，认证、网络、无效JSON或超预算均失败。异步读失效不产生通过事实；任一失败停止新派发并收尾本次读子进程。写入响应未知沿用原HEAD/tarball/receipt及dist.integrity恢复，不重打包或并行重放。跨机器继续原单发行写者规则。

界限：每查询60秒/1MiB stdout，整批200秒、版本历史最多20000项/标签128项；单快照七包，输入输出均无凭据。记录实际观测时间、查询耗时和并发峰值；不把读性能测量冒充真实npm发布速度。

回退：维护者脚本独立回退，不改已发布版本；旧receipt没有新增plan字段时从既有priorTags/channelPolicy确定性派生。含新plan时校验与原policy一致。

可证伪验证：真实子进程/受控npm证明限流、队列补位、404与401区别、deadline及输出界限；拓扑/root最后/循环、旧和目标标签、并发漂移拒绝与无需重复标签写入；既有artifact/receipt/channel/版本范围脚本测试。当前registry只读计时可执行，正式发包另按已有授权。
