# 受控文件外部处理交换

状态：实现中，未发布。

PL-18证明content URL受登录保护且固定大小PUT不能承接未知大小的水印结果。平台服务拥有文件/RLS、存储委托和最终就绪状态；SDK仅传递当前用户、业务动作或应用服务身份，不引入代理文件服务器、额外用户状态或Cookie转发。

新增createFileDownloadSession、initiateFileOutput、completeFileOutput到三种Nest DataApi服务。下载最多300秒，签发时重新校验文件权限；存储签名在到期前不支持即时撤回。输出计划是pending/completed判别联合，pending仅有fileId及POST policy表单，不返回虚构大小FileRef；完成返回真实文件引用。调用方必须将formFields原样作为multipart字段，file放最后；不得将POST降成PUT或省略policy。旧固定大小上传接口不变。

服务端输出回执以主体/租户/应用/环境/版本/Head及幂等键隔离，输出上限不超过字段限制及100MiB，存储policy固定暂存对象、类型、长度区间与到期时间。完成复制到独立最终对象，避免外部会话改写完成文件；重复完成返回同一结果。仅显式调用新API，V1不受影响。

失败不伪造文件或调用正式签署；不支持的存储提供者明确报能力不可用。客户端回滚为旧SDK后无法调用新接口，既有文件引用仍有效。验收包括三种身份传递、环境/业务动作保留、POST表单类型、完成回读、大小超限/幂等冲突/跨环境拒绝；真实水印服务与存储验证由部署后完成。
