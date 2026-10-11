---
"openxiangda": minor
"openxiangda-contracts": minor
---

V2 审批详情改为连续阅读，补填、进度和按需展开的资料变更共用原详情控制器。移动端最多两项主操作与更多入口保持单行，桌面显示三项主操作；根据服务端 prominence 与 consequence 展示顺序和后果，保留旧 Surface 的元数据回退、权限、幂等和原请求恢复。配套服务端明确区分拒绝申请与退回，代码不涉及 V1 页面。
