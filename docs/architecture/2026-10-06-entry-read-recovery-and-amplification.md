# 有界入口放行与只读恢复

## 证据与归属

r65 原图 8000 人，7989 人原提交30分钟内读回，原数据库1000成功/6990满额且无超卖。980607条请求中440793次入口probe、95500次HTML、279228次result；入口ready提示在2004人波次内竞争4个实际槽，导致大量reload后继续等待。7个身份GET因独立三次transport上限退出；受理后返回者的GET客户端超时、网关200，下一次原Cookie expired，成功释放入口记录先于客户端确认。另外两例先前网关499后expired，根因未证实，必须保留。

Redis是入口顺序/预算/槽位唯一所有者；SDK是原身份GET恢复与取消唯一所有者。没有业务、身份响应缓存或应用特殊接口。入口等待仍默认关闭，V1不进入新逻辑。V2结果过载回执只改变推荐读取间隔，业务受理/执行/名额/期限不变。

## 决策

1. 原Redis等待记录可取得20秒轻量放行预约。仅实际有空闲槽和令牌时占用原id的slot，probe返回ready；同id同stage claim消费该预约，不再次扣令牌。等待状态和原排队序号保持，预约不等同身份/授权。离线预约在20秒后释放，有限波次允许后续活跃客户端竞争；实际执行仍须owner claim和全部现有围栏。过期slot按Redis TIME移除，原等待deadline不刷新。
2. HTML/identity等待hint下限2秒、上限60秒；HTML页面尊重该hint并加最多20%抖动。90秒等待heartbeat覆盖72秒休眠+10秒query；不延长期限、取消立即停止。身份SDK仍尊重现有回执剩余期限，网络错误使用指数退避而非2秒重试。
3. 成功identity完成释放执行槽与claim，但保留原scope/id轻量idle状态最多90秒或原deadline（较早者）。丢失响应的旧Cookie可重新排队读取真实身份；不返回缓存身份、不跳过授权、不重放写。成功客户端仍清Cookie。完成状态仍计入原maxRecords，必须在真实Redis验证容量、清理和取消。
4. SDK身份GET取消固定三次transport计数退出，仍受普通5分钟/明确回执至多30分钟、120/900尝试、10秒单次链和取消限制。只有已支持的TimeoutError/PLATFORM_TRANSPORT_UNAVAILABLE可恢复；权限拒绝、不可重试错误、expired/full保持立即退出，投影10秒链不改变。
5. V2 result lane过载推荐10秒读取间隔，其他lane不变。现有SDK遵循server hint，原提交结果GET不会产生新写。

## 兼容、资源与回退

不新增键、状态枚举、身份缓存或数据库migration。预约字段为原waiting记录的附加数值；slots仍为唯一计数，记录上限/有限64项expiry清理不变。混合旧binary可能不消费预约并多等最多原heartbeat清理窗口，不得声称混合版本无延迟；原id不获新deadline，旧版本继续按waiting/idle处理。关闭入口等待或回退代码不改变业务命令；未过期轻量记录在原有限期限内清理。后续发布需同源SDK与UI制品，保留现役r65恢复点。

## 可证伪验收

真实Redis10000记录：128个离线队头不堵死；大量probe最多workSlots个ready预约；并发跨副本同id仅一个claim；预约到期释放并可在原deadline再排；rate令牌不得绕过；成功identity旧Cookie在grace内重新读取、grace/真实期限到期拒绝、cap不扩大、跨scope拒绝。客户端60秒hint+抖动不提前查询且不越deadline；有回执和无回执连续三次网络失败后可恢复，明确拒绝/投影链/取消/永远悬挂仍有界。result推荐间隔header/data一致。重新校准新HTML/SDK、浏览器与隔离活动原图再测，旧失败不能改成通过。缺失网关trace与未受理原意图继续单列。
