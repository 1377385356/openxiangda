# C81 日期选择约束与页面提示

状态：实施；V2 Field Kit 与具名提交页的可选展示能力。

源证据：YWTB-099 V14 的08业务解释L13引用真实 disabledDate L86–98禁周一；
onOk L104–143仅提示端点9:30≤x<16:30，beforeSubmit=false，不构成提交门禁。
当前 DateTimeConstraints 仅有时区、范围与步长；根SDK没有把约束和动态提示
接入普通PC/手机生成流程表单的扩展点，草稿使用的fieldState.description不受支持。

应用页面拥有选择约束与提示，平台仍拥有数据、授权和提交校验。添加
DateTimeConstraints.disabledWeekdays（ISO周一1到周日7），限datetime/range，
共享zonedInputResult给PC手填与手机选择同一结果，PC日历禁选，手机过滤日期。
约束不作为Native表单/工作流校验，不修改原已有值；历史值和旧回执可以正常读取。
新增具名表单dateTimeConstraints按已匹配字段接入Field Kit；fieldHints只在
已匹配字段旁提供页面提示。提示不增加required、不改用户输入、不触发业务操作。

未知字段、不适用类型、无效weekday/时区/边界由展示规则错误阻止新表单；空值
仍可清除、区间仍沿现有canonical codec。无新状态库、持久规则或异步调用。
每字段最多7weekday，手机日期既有731项上限不扩；旧表单无配置行为不变，1.x
不受影响。回滚移除页面选项，既有记录与任务无需迁移。

可证伪验证：上海周一禁选而UTC日号不误判、周日/周二可选、输入与两端range
一致拒绝周一新选择；原值保持、16:30可填但提示、空值可提交、不可注入其他字段。
定向时区/边界测试及真实PC/390px控件操作必需，源码验证不算源回调等价验收。
