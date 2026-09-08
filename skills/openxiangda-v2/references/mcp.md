# MCP 配置与工具参考

> 工具说明和输入参数从当前 MCP 注册表生成。

## 连接项目

MCP 使用项目锁定的根包；在客户端配置下列 stdio 启动参数，把路径换成真实工作区的绝对路径：

```json
{
  "command": "pnpm",
  "args": ["--dir", "/绝对路径/应用", "exec", "openxiangda", "--mcp-stdio", "--cwd", "/绝对路径/应用"]
}
```

客户端负责启动进程。登录、创建应用和长期运行的 dev 服务使用 [CLI](cli.md)。依赖升级后重启 MCP 进程。首先读取 workspace_context，再按任务读取 docs_read 和相关契约。MCP 不自动部署；在用户已授权范围内执行修改，无需重复确认。

## 读取资源

- `openxiangda://workspace/context`
- `openxiangda://workspace/contracts`
- `openxiangda://workspace/appspec`
- `openxiangda://platform/capabilities`
- `openxiangda://deployments/latest`
- `openxiangda://environments`
- `openxiangda://docs/index`

资料目录返回当前版本、摘要、主题 URI 和章节 ID；读取 `openxiangda://docs/{topic}` 得到中文 Markdown 正文。只需一个章节时使用 docs_read 的 section。资料只来自同版本根包的固定目录，不接受任意文件路径或网络 URL。

## 结果与失败处理

工具返回相同内容的 structuredContent 与文本结果，包含 ok、operation、data 和适用的 diagnostics/nextActions。业务失败设置 isError=true；按错误码、定位和平台 recovery 决定下一步。工具协议错误同样停止当前操作。check_app 会生成文件并运行检查、测试、构建；失败后未执行的阶段标记 skipped。deploy_app 已包含完整检查，生产晋级必须传入成功的测试 DeploymentRun ID，不重新构建。详见 [校验](testing.md)与[部署](delivery.md)。

## authorization_status

核验平台授权。只读核验明确指定站点的当前授权；不依赖工作区，不启动登录、刷新凭据或修改绑定。authorized 不代表应用管理权限。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "minLength": 1,
      "description": "明确指定目标平台地址"
    }
  },
  "required": [
    "baseUrl"
  ],
  "additionalProperties": false
}
```

## workspace_context

查看工作区。首先读取当前项目、工具链版本和绑定，不运行构建或创建远端对象。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {}
}
```

## contract_describe

查看应用契约。默认返回有界索引；用 selector 读取模型、流程、能力，或 navigation/permissions。菜单建议只复制一次，运行时不自动应用。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "selector": {
      "description": "index、navigation、permissions、all 或索引给出的选择器",
      "type": "string",
      "maxLength": 200
    },
    "offset": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  },
  "additionalProperties": false
}
```

## appspec_context

读取需求与设计。读取设计索引、稳定 ID 正文与引用闭包、开工和测试发布缺口；设计基线确认后制定实施计划，生产晋级核对原测试版本实际验收。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "selector": {
      "description": "能力、变更、ADR 或 DES-* 设计的稳定 ID",
      "type": "string",
      "minLength": 1
    },
    "historyOffset": {
      "default": 0,
      "description": "历史索引偏移，每页 50 条",
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    }
  }
}
```

## appspec_verify

核对业务验收报告。读取成功测试运行与 Git 中的真实验收报告，核对版本绑定、场景结果和性能证据；有实际授权的性能延期单列为deferred未通过，不豁免功能AC，不自动编造或执行验收。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "deploymentId": {
      "type": "string",
      "minLength": 1
    },
    "evidencePath": {
      "description": "appspec/verification/*.json；省略时按运行 ID 读取",
      "type": "string"
    }
  },
  "required": [
    "deploymentId"
  ]
}
```

## docs_read

读取中文使用资料。不传 topic 返回当前版本的主题和章节目录；传 topic/section 读取对应正文。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "topic": {
      "description": "主题目录中的 ID",
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    },
    "section": {
      "description": "主题章节目录中的 ID",
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  },
  "additionalProperties": false
}
```

## administration_context

查看应用管理入口。读取当前用户可用的管理能力和入口；不修改角色或成员。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "environment": {
      "default": "test",
      "description": "目标环境；默认 test，production 必须明确选择",
      "type": "string",
      "enum": [
        "test",
        "production"
      ]
    }
  }
}
```

## workflow_node_configurations

查看流程有效参数。修改已部署流程前，读取管理员维护的节点配置。已有任务和后续节点进入使用各自适用版本。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "environment": {
      "default": "test",
      "description": "目标环境；默认 test，production 必须明确选择",
      "type": "string",
      "enum": [
        "test",
        "production"
      ]
    },
    "workflowCode": {
      "type": "string",
      "minLength": 1,
      "description": "流程声明中的 code"
    }
  },
  "required": [
    "workflowCode"
  ]
}
```

## check_app

检查完整应用。先在本地完成完整配置校验，默认核对平台同源规则与只读环境条件，再生成、静态检查、测试和构建。local 仅用于本地或 CI 验证，不证明目标环境可部署；正式 deploy 始终预检平台。会写本地文件，前置失败即停止。

- 只读：否
- 可替换文件或改变远端状态：是
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "environment": {
      "default": "test",
      "description": "目标环境；默认 test，production 必须明确选择",
      "type": "string",
      "enum": [
        "test",
        "production"
      ]
    },
    "local": {
      "default": false,
      "description": "仅本地完整检查；结果 validationScope=local，不核对现场条件",
      "type": "boolean"
    }
  }
}
```

## deployment_plan

预览应用发布。只读预览测试部署的运行配额，或指定测试版本的生产晋级；返回容量与缺口，不构建、上传或提交运行。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "environment": {
      "default": "test",
      "description": "目标环境；默认 test，production 必须明确选择",
      "type": "string",
      "enum": [
        "test",
        "production"
      ]
    },
    "from": {
      "description": "production 必填：成功测试 DeploymentRun ID；test 不接受",
      "type": "string",
      "minLength": 1
    },
    "deploymentStrategy": {
      "description": "仅 TEST；显式 maintenance-replace 允许停机替换并由平台处理失败恢复，默认 rolling",
      "type": "string",
      "enum": [
        "rolling",
        "maintenance-replace"
      ]
    },
    "environmentId": {
      "description": "测试环境 ID，通常由平台绑定确定",
      "type": "string"
    },
    "idempotencyKey": {
      "description": "测试部署幂等键，省略时由包摘要派生",
      "type": "string"
    },
    "wait": {
      "default": true,
      "description": "默认跟踪平台运行至完成，最多 15 分钟；false 只提交，随后必须查询状态",
      "type": "boolean"
    }
  },
  "additionalProperties": false
}
```

## environment_status

查看环境状态。读取已配置环境、运行状态与当前不可变版本。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {}
}
```

## start_environment

启动应用环境。在用户已授权范围内，从当前不可变版本恢复运行。

- 只读：否
- 可替换文件或改变远端状态：是
- 幂等：是

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "environment": {
      "default": "test",
      "description": "目标环境；默认 test，production 必须明确选择",
      "type": "string",
      "enum": [
        "test",
        "production"
      ]
    },
    "idempotencyKey": {
      "description": "相同操作重试时保持不变",
      "type": "string",
      "minLength": 1
    }
  },
  "additionalProperties": false
}
```

## stop_environment

暂停应用环境。在用户已授权范围内停止运行，保留数据和配置。

- 只读：否
- 可替换文件或改变远端状态：是
- 幂等：是

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "environment": {
      "default": "test",
      "description": "目标环境；默认 test，production 必须明确选择",
      "type": "string",
      "enum": [
        "test",
        "production"
      ]
    },
    "idempotencyKey": {
      "description": "相同操作重试时保持不变",
      "type": "string",
      "minLength": 1
    }
  },
  "additionalProperties": false
}
```

## deploy_app

部署或晋级应用。test 包含检查、按需后端镜像构建、密封和提交；production 必须用 from 复用成功测试版本。已有明确授权无需再次确认。默认持续报告进度并等待平台部署完成，真实业务验收另行执行。观察中断后继续查询原运行。

- 只读：否
- 可替换文件或改变远端状态：是
- 幂等：是

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "environment": {
      "default": "test",
      "description": "目标环境；默认 test，production 必须明确选择",
      "type": "string",
      "enum": [
        "test",
        "production"
      ]
    },
    "from": {
      "description": "production 必填：成功测试 DeploymentRun ID；test 不接受",
      "type": "string",
      "minLength": 1
    },
    "deploymentStrategy": {
      "description": "仅 TEST；显式 maintenance-replace 允许停机替换并由平台处理失败恢复，默认 rolling",
      "type": "string",
      "enum": [
        "rolling",
        "maintenance-replace"
      ]
    },
    "environmentId": {
      "description": "测试环境 ID，通常由平台绑定确定",
      "type": "string"
    },
    "idempotencyKey": {
      "description": "测试部署幂等键，省略时由包摘要派生",
      "type": "string"
    },
    "wait": {
      "default": true,
      "description": "默认跟踪平台运行至完成，最多 15 分钟；false 只提交，随后必须查询状态",
      "type": "boolean"
    }
  },
  "additionalProperties": false
}
```

## deployment_status

查询部署状态。查询指定或最近部署，平台状态和恢复决定是权威；watch 跟踪原运行，不重新构建或部署。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "deploymentId": {
      "description": "省略时查询最近部署",
      "type": "string",
      "minLength": 1
    },
    "watch": {
      "default": false,
      "description": "持续跟踪原运行至结束，最多 15 分钟",
      "type": "boolean"
    }
  }
}
```

## deployment_logs

读取部署日志。读取检查点、首个和最近失败、候选状态与恢复下一步。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "deploymentId": {
      "type": "string",
      "minLength": 1,
      "description": "平台返回的 DeploymentRun ID"
    }
  },
  "required": [
    "deploymentId"
  ],
  "additionalProperties": false
}
```

## cancel_deployment

取消未激活部署。仅在用户授权且平台 recovery.cancelAllowed 为真时取消；激活后的运行不能取消。

- 只读：否
- 可替换文件或改变远端状态：是
- 幂等：是

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "deploymentId": {
      "type": "string",
      "minLength": 1,
      "description": "平台返回的 DeploymentRun ID"
    }
  },
  "required": [
    "deploymentId"
  ],
  "additionalProperties": false
}
```

## retry_deployment

重试可恢复部署。在用户授权范围内按平台 recovery.nextCommand 重试原运行；不创建新的候选绕过失败。

- 只读：否
- 可替换文件或改变远端状态：是
- 幂等：是

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "deploymentId": {
      "type": "string",
      "minLength": 1,
      "description": "平台返回的 DeploymentRun ID"
    }
  },
  "required": [
    "deploymentId"
  ],
  "additionalProperties": false
}
```

## rollback_app

回滚应用版本。在用户授权范围内回滚到指定历史 AppVersion；版本回滚不承诺撤销业务数据写入。

- 只读：否
- 可替换文件或改变远端状态：是
- 幂等：是

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "environment": {
      "default": "test",
      "description": "目标环境；默认 test，production 必须明确选择",
      "type": "string",
      "enum": [
        "test",
        "production"
      ]
    },
    "appVersionId": {
      "type": "string",
      "minLength": 1,
      "description": "已知历史 AppVersion ID"
    }
  },
  "required": [
    "appVersionId"
  ],
  "additionalProperties": false
}
```
