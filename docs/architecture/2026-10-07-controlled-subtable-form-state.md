# 受控子行表单与选择上下文

状态：2026-10-07实施决定。单一主题：受控子行表单跟随父表权威值。

## 问题证据与所有者

B11手机监考真实表单中，授权人物联动成功，但隐藏的时间配置ID未进入选择器
绑定，时间列表为空；消费人物snapshot后手填电话又被旧snapshot覆盖。证据保留在
workflow-lab-app的b11-browser-submit-recovered.log与failure-submit.png。
SDK SubtableField拥有子行受控表单，ResourceReferenceField拥有声明的选择绑定；
应用拥有联动规则，Server继续唯一授权、校验、事务与原结果。

## 不变量与范围

父表返回的每个子字段值整体替换本地Form字段；不得深度合并已被联动移除的
snapshot等旧子属性。仅同步row.data中已有字段，不补造数据、不清其他行。
选择绑定可读取当前Form已保存但未渲染的值，且只提取source.filters中声明的
field。它仍是不可信查询上下文，Server过滤/投影/授权不变，不成为提交许可。
PC和手机使用相同语义；API、模型、权限与存储契约无变化。稳定1.x不受影响。

## 失败、并发、资源与回滚

无新增请求、写操作、缓存或重试；原Form值、用户输入、字段资格、清除依赖及
容量限制保持。提交仍经过既有校验和CAS，未知结果先查原回执。回退两处SDK
修改即可，保留业务记录；旧问题复现时停相关新增入口，不修写数据库。

## 可证伪验证

用实际SDK PC/手机子表组件：未渲染context能作为声明绑定查询；选择一行人物
消费snapshot后手填电话，再选择另一行人物/时段，首行手填保持且snapshot不复活。
清除/改选能更新本行，另一行不受影响。检查未定义绑定和既有binding reset测试。
B11原手机申请继续提交与两级审核作为独立本地平台证据，fixture不称生产验收。
只跑相关浏览器和affected gates；不为此冻结包或构建镜像，留B08–B11批次退出。

## 源码验证

两端实际SubtableField/ResourceReferenceField组件浏览器回归通过，包含隐藏绑定、
消费snapshot、首行手填及第二行选人；脚本verify-controlled-subtable-source.mjs，
结果在.cache/c41-browser/result.json。pnpm verify:affected为12/12任务通过。
B11手机真实表单也已显示时间并保持手填；随后提交暴露另一个只读派生字段投影
差异，另按主题处理，不把整条申请称为已通过。本主题没有版本升级或冻结。
