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

## template_list

发现源码模板。列出业务场景、模块依赖、四类源码外壳和主题；创建使用 CLI，不执行远端操作。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {},
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

查看应用契约。默认返回有界索引；用 selector 读取模型、流程、能力，或 navigation/permissions/prerequisites。任务前提来自原编译器，不代表目标或角色可用。菜单建议只复制一次，运行时不自动应用。

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
      "description": "index、navigation、permissions、prerequisites、all 或索引给出的选择器",
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
  },
  "additionalProperties": false
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
  ],
  "additionalProperties": false
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
  },
  "additionalProperties": false
}
```

## application_operations

发现应用运行自助操作。读取事件诊断与指定投递恢复、加密环境凭据复用、通知渠道配置/默认/健康/失败恢复的有界操作目录和输入 Schema。无需管理页面；沿用当前应用权限。

- 只读：是
- 可替换文件或改变远端状态：否
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

## application_operation

执行应用运行自助操作。先读 application_operations 或 docs_read(application-operations)，在用户已授权范围内执行。environment 必须明确。每种操作严格校验 input，拒绝自报身份及任意 API。密钥复制只接受名称和修订，恢复只接受指定原投递；结果未知先查原证据，不自动批量重试。读操作无副作用，配置有 CAS；健康写入诊断元数据，通知恢复可能实际发送。

- 只读：否
- 可替换文件或改变远端状态：是
- 幂等：否

输入参数：

```json
{
  "type": "object",
  "oneOf": [
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "workflows.legacy-prepare",
          "description": "准备旧审批当前节点接续，冻结原申请人、轮次、历史和Native业务单"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "schemaVersion": {
              "const": "openxiangda.workflow-legacy-adoption-prepare/v2"
            },
            "requestKey": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            "reason": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1000
            },
            "expectedHeadRevision": {
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "workflowCode": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128,
              "pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$"
            },
            "resourceCode": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128,
              "pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$"
            },
            "recordId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            },
            "expectedRevision": {
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "source": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "system": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$"
                },
                "recordKey": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 255
                },
                "snapshotSha256": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 64,
                  "pattern": "^[0-9a-f]{64}$"
                },
                "recordSha256": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 64,
                  "pattern": "^[0-9a-f]{64}$"
                }
              },
              "required": [
                "system",
                "recordKey",
                "snapshotSha256",
                "recordSha256"
              ]
            },
            "checkpoint": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "initiatorUserId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 36,
                  "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
                },
                "approvalRound": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 2147483647
                },
                "currentNodeId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128,
                  "pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$"
                },
                "initiatorField": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 63,
                  "pattern": "^[A-Za-z][A-Za-z0-9_]{0,62}$"
                },
                "initiatorIdentityField": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 63,
                  "pattern": "^[A-Za-z][A-Za-z0-9_]{0,62}$"
                },
                "roundField": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 63,
                  "pattern": "^[A-Za-z][A-Za-z0-9_]{0,62}$"
                },
                "stateField": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 63,
                  "pattern": "^[A-Za-z][A-Za-z0-9_]{0,62}$"
                },
                "stateValue": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 255
                },
                "history": {
                  "type": "array",
                  "maxItems": 64,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                      "nodeId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128,
                        "pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$"
                      },
                      "reviewerDisplay": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 255
                      },
                      "reviewedAt": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 64
                      },
                      "opinion": {
                        "type": "string",
                        "maxLength": 8192
                      },
                      "reviewerField": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 63,
                        "pattern": "^[A-Za-z][A-Za-z0-9_]{0,62}$"
                      },
                      "reviewedAtField": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 63,
                        "pattern": "^[A-Za-z][A-Za-z0-9_]{0,62}$"
                      },
                      "opinionField": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 63,
                        "pattern": "^[A-Za-z][A-Za-z0-9_]{0,62}$"
                      }
                    },
                    "required": [
                      "nodeId",
                      "reviewerDisplay",
                      "reviewedAt",
                      "opinion",
                      "reviewerField",
                      "reviewedAtField",
                      "opinionField"
                    ]
                  }
                }
              },
              "required": [
                "initiatorUserId",
                "approvalRound",
                "currentNodeId",
                "initiatorField",
                "initiatorIdentityField",
                "roundField",
                "stateField",
                "stateValue",
                "history"
              ]
            }
          },
          "required": [
            "schemaVersion",
            "requestKey",
            "reason",
            "expectedHeadRevision",
            "workflowCode",
            "resourceCode",
            "recordId",
            "expectedRevision",
            "source",
            "checkpoint"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "workflows.legacy-apply",
          "description": "按原计划摘要原子接续当前节点，仅创建当前待办"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "schemaVersion": {
              "const": "openxiangda.workflow-legacy-adoption-apply/v2"
            },
            "planId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            },
            "expectedPlanDigest": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64,
              "pattern": "^[0-9a-f]{64}$"
            }
          },
          "required": [
            "schemaVersion",
            "planId",
            "expectedPlanDigest"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "workflows.legacy-receipt",
          "description": "读取旧审批接续准备或执行回执"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "planId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            }
          },
          "required": [
            "planId"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "acceptance-data.prepare",
          "description": "准备可回收的TEST原生数据批次及原验收身份"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "requestKey": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            },
            "expectedAppVersionId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            },
            "expectedHeadRevision": {
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "expiresInMinutes": {
              "type": "integer",
              "minimum": 15,
              "maximum": 1440
            },
            "recordLimit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 1000
            },
            "redirectUri": {
              "type": "string",
              "minLength": 1,
              "maxLength": 2048
            },
            "actors": {
              "type": "array",
              "minItems": 1,
              "maxItems": 12,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "key": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 80
                  },
                  "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 255
                  },
                  "roleCodes": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 32,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128
                    }
                  },
                  "departmentIds": {
                    "type": "array",
                    "maxItems": 128,
                    "uniqueItems": true,
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128
                    }
                  }
                },
                "required": [
                  "key",
                  "roleCodes"
                ]
              }
            }
          },
          "required": [
            "requestKey",
            "expectedAppVersionId",
            "expectedHeadRevision",
            "actors"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "acceptance-data.status",
          "description": "读回原TEST验收批次状态和修复引用"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "runId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            }
          },
          "required": [
            "runId"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "acceptance-data.stop",
          "description": "停止此TEST批次写入并撤销来源会话"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "runId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            }
          },
          "required": [
            "runId"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "acceptance-data.preview-cleanup",
          "description": "只读精确归属、原repair清单和剩余对象；不执行删除"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "runId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            }
          },
          "required": [
            "runId"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "acceptance-data.execute-cleanup",
          "description": "按预览digest通过原repair执行金丝雀或剩余删除"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "runId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            },
            "manifestSha256": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64,
              "pattern": "^[a-f0-9]{64}$"
            },
            "mode": {
              "type": "string",
              "enum": [
                "canary",
                "remaining"
              ]
            }
          },
          "required": [
            "runId",
            "manifestSha256",
            "mode"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "diagnostics.semantic-audit",
          "description": "绑定当前TEST版本和Head的文件值语义审计；仅观察，不修复或授予激活许可"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "requirementId": {
              "const": "native.file-value.v2-envelope"
            },
            "resourceCode": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128,
              "pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$"
            },
            "expectedAppVersionId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            },
            "expectedHeadRevision": {
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "afterRecordId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            },
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100
            }
          },
          "required": [
            "requirementId",
            "resourceCode",
            "expectedAppVersionId",
            "expectedHeadRevision"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "diagnostics.execution-health",
          "description": "按原ID核对未来计划、暂停、claim和租约；不恢复或重放"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "legacy-schedule",
                "timer",
                "date-trigger",
                "event-delivery"
              ]
            },
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            }
          },
          "required": [
            "kind",
            "id"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "events.status",
          "description": "读取队列积压、消费者健康、写入保护阈值和恢复条件"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {},
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "events.subscriptions",
          "description": "读取当前环境订阅及配置修订"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {},
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "events.deliveries",
          "description": "分页读取投递、失败重试和死信"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100
            },
            "cursor": {
              "type": "string",
              "minLength": 1,
              "maxLength": 2048
            },
            "from": {
              "type": "string",
              "minLength": 1,
              "maxLength": 40
            },
            "to": {
              "type": "string",
              "minLength": 1,
              "maxLength": 40
            }
          },
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "events.journal",
          "description": "分页读取不可变事件日志"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100
            },
            "cursor": {
              "type": "string",
              "minLength": 1,
              "maxLength": 2048
            },
            "from": {
              "type": "string",
              "minLength": 1,
              "maxLength": 40
            },
            "to": {
              "type": "string",
              "minLength": 1,
              "maxLength": 40
            }
          },
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "events.audit",
          "description": "分页读取事件恢复操作审计"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100
            },
            "cursor": {
              "type": "string",
              "minLength": 1,
              "maxLength": 2048
            }
          },
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "events.replay",
          "description": "恢复指定原投递；可显式选择已修复的当前订阅"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "deliveryId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            },
            "reason": {
              "type": "string",
              "minLength": 1,
              "maxLength": 500,
              "description": "操作原因；保留到平台审计"
            },
            "idempotencyKey": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128,
              "description": "同一次操作及未知结果重试保持原键和完整请求"
            },
            "useCurrentSubscription": {
              "type": "boolean"
            }
          },
          "required": [
            "deliveryId",
            "reason",
            "idempotencyKey",
            "useCurrentSubscription"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "secrets.list",
          "description": "读取当前环境凭据元信息和修订，不读取明文"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {},
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "secrets.copy",
          "description": "从同应用另一个环境原子复制所选加密凭据"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "sourceEnvironment": {
              "type": "string",
              "enum": [
                "test",
                "production"
              ]
            },
            "reason": {
              "type": "string",
              "minLength": 1,
              "maxLength": 500,
              "description": "操作原因；保留到平台审计"
            },
            "idempotencyKey": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128,
              "description": "同一次操作及未知结果重试保持原键和完整请求"
            },
            "secrets": {
              "type": "array",
              "minItems": 1,
              "maxItems": 50,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "sourceRevision": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 9007199254740991
                  },
                  "expectedRevision": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 9007199254740991
                  }
                },
                "required": [
                  "name",
                  "sourceRevision",
                  "expectedRevision"
                ]
              }
            }
          },
          "required": [
            "sourceEnvironment",
            "reason",
            "idempotencyKey",
            "secrets"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.diagnostics",
          "description": "诊断默认通道、凭据、收件人绑定及失败投递"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {},
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.channels",
          "description": "读取渠道配置、能力、健康及修订"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {},
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.rules",
          "description": "读取通知规则及修订"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {},
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.bootstrap",
          "description": "初始化缺少的标准通知模板和规则"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {},
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.configure-external-http",
          "description": "配置 External HTTP 通道；鉴权仅接受 Secret 引用"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "bindingCode": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            "expectedRevision": {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            "status": {
              "type": "string",
              "enum": [
                "active",
                "paused"
              ]
            },
            "confirmProduction": {
              "type": "boolean"
            },
            "config": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "schemaVersion": {
                  "const": "openxiangda.notification.external-http-channel/v2"
                },
                "providerCode": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "baseUrl": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 2048
                },
                "identityRealm": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 255
                },
                "auth": {
                  "oneOf": [
                    {
                      "type": "object",
                      "additionalProperties": false,
                      "properties": {
                        "mode": {
                          "const": "HMAC_SHA256"
                        },
                        "keyId": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 128
                        },
                        "secretRef": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 128
                        }
                      },
                      "required": [
                        "mode",
                        "keyId",
                        "secretRef"
                      ]
                    },
                    {
                      "type": "object",
                      "additionalProperties": false,
                      "properties": {
                        "mode": {
                          "const": "OAUTH2_CLIENT_CREDENTIALS"
                        },
                        "tokenUrl": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 2048
                        },
                        "clientIdSecretRef": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 128
                        },
                        "clientSecretSecretRef": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 128
                        },
                        "scope": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 500
                        },
                        "audience": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 500
                        }
                      },
                      "required": [
                        "mode",
                        "tokenUrl",
                        "clientIdSecretRef",
                        "clientSecretSecretRef"
                      ]
                    },
                    {
                      "type": "object",
                      "additionalProperties": false,
                      "properties": {
                        "mode": {
                          "const": "MTLS"
                        },
                        "certSecretRef": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 128
                        },
                        "keySecretRef": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 128
                        },
                        "caSecretRef": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 128
                        }
                      },
                      "required": [
                        "mode",
                        "certSecretRef",
                        "keySecretRef"
                      ]
                    }
                  ]
                },
                "callback": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "enabled": {
                      "type": "boolean"
                    },
                    "hmacKeyId": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128
                    },
                    "hmacSecretRef": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128
                    },
                    "maxSkewSeconds": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 9007199254740991
                    },
                    "actionTokenTtlMinutes": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 9007199254740991
                    }
                  },
                  "required": [
                    "enabled",
                    "maxSkewSeconds",
                    "actionTokenTtlMinutes"
                  ]
                },
                "features": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "interactiveActions": {
                      "type": "boolean"
                    },
                    "readReceipt": {
                      "type": "boolean"
                    },
                    "todoSemantics": {
                      "type": "boolean"
                    }
                  },
                  "required": [
                    "interactiveActions",
                    "readReceipt",
                    "todoSemantics"
                  ]
                },
                "requestTimeoutMs": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 60000
                }
              },
              "required": [
                "schemaVersion",
                "providerCode",
                "baseUrl",
                "identityRealm",
                "auth",
                "callback",
                "features",
                "requestTimeoutMs"
              ]
            }
          },
          "required": [
            "bindingCode",
            "expectedRevision",
            "status",
            "config"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.configure-dingtalk-oa",
          "description": "配置钉钉 OA 工作通知通道；仅使用 Secret 引用"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "bindingCode": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            "expectedRevision": {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            "status": {
              "type": "string",
              "enum": [
                "active",
                "paused"
              ]
            },
            "config": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "schemaVersion": {
                  "const": "openxiangda.notification.dingtalk-work-notice-oa-channel/v2"
                },
                "corpId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 255
                },
                "agentId": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 255
                },
                "clientIdSecretRef": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "clientSecretSecretRef": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                },
                "requestTimeoutMs": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 60000
                },
                "decorationImage": {
                  "type": "string",
                  "enum": [
                    "NONE",
                    "PLATFORM_WORKFLOW"
                  ]
                }
              },
              "required": [
                "schemaVersion",
                "corpId",
                "agentId",
                "clientIdSecretRef",
                "clientSecretSecretRef",
                "requestTimeoutMs",
                "decorationImage"
              ]
            }
          },
          "required": [
            "bindingCode",
            "expectedRevision",
            "status",
            "config"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.test",
          "description": "检查渠道凭据与外部协议健康；不发送实际收件通知"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "bindingCode": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            "channel": {
              "type": "string",
              "enum": [
                "external-http",
                "dingtalk-work-notice-oa",
                "dingtalk-card"
              ]
            }
          },
          "required": [
            "bindingCode",
            "channel"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.set-default",
          "description": "为当前环境 workflow.standard 规则选择默认渠道"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "bindingCode": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            "expectedRevision": {
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "expectedBindingRevision": {
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            }
          },
          "required": [
            "bindingCode",
            "expectedRevision",
            "expectedBindingRevision"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.messages",
          "description": "按业务关联或收件人分页查询原通知"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100
            },
            "offset": {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            "status": {
              "type": "string",
              "minLength": 1,
              "maxLength": 50
            },
            "correlationId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 255
            },
            "recipientUserId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 255
            }
          },
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.message",
          "description": "读取原消息、收件人、投递尝试和审计"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "messageId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            }
          },
          "required": [
            "messageId"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.dead-letters",
          "description": "分页查询通知死信，可限定原 messageId"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100
            },
            "offset": {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            "messageId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            }
          },
          "required": []
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    },
    {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "operation": {
          "const": "notifications.replay",
          "description": "修复配置后仅恢复指定原通知死信"
        },
        "environment": {
          "type": "string",
          "enum": [
            "test",
            "production"
          ]
        },
        "input": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "deadLetterId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 36,
              "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            }
          },
          "required": [
            "deadLetterId"
          ]
        }
      },
      "required": [
        "operation",
        "environment",
        "input"
      ]
    }
  ]
}
```

## workflow_sync

同步流程到目标环境。按目标流程修订号显式同步，默认同时更新在途和新申请；复用发布及版本适用规则。保留指定人员边界。

- 只读：否
- 可替换文件或改变远端状态：是
- 幂等：是

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "workflowCode": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "fromEnvironment": {
      "type": "string",
      "enum": [
        "test",
        "production"
      ]
    },
    "toEnvironment": {
      "type": "string",
      "enum": [
        "test",
        "production"
      ]
    },
    "expectedSourceHeadRevision": {
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "expectedTargetHeadRevision": {
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "operationId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1000
    },
    "scope": {
      "type": "string",
      "enum": [
        "running_and_new",
        "new_only"
      ]
    },
    "acknowledgeExceptions": {
      "type": "boolean"
    },
    "copyHandlingDefaults": {
      "type": "boolean"
    }
  },
  "required": [
    "workflowCode",
    "fromEnvironment",
    "toEnvironment",
    "expectedSourceHeadRevision",
    "expectedTargetHeadRevision",
    "operationId",
    "reason"
  ],
  "additionalProperties": false
}
```

## workflow_export

导出流程到工作区。只读导出环境中的规范定义、绑定和办理设置摘要；不包含运行记录或环境内部标识。

- 只读：否
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
      "minLength": 1
    },
    "out": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "workflowCode",
    "out"
  ],
  "additionalProperties": false
}
```

## workflow_import

把流程导入源码。验证代码能力和摘要后修改工作区显式流程声明，保留人员配置边界。

- 只读：否
- 可替换文件或改变远端状态：是
- 幂等：否

输入参数：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1
    },
    "adoptHandlingDefaults": {
      "default": false,
      "type": "boolean"
    }
  },
  "required": [
    "path"
  ],
  "additionalProperties": false
}
```

## workflow_plan_registration

规划流程版本登记。服务器只读查询已有摘要和下一版本数字；write 只写源码版本数字，不写环境观察。

- 只读：否
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
    "write": {
      "default": false,
      "type": "boolean"
    }
  },
  "additionalProperties": false
}
```

## workflow_status

查看流程源码同步状态。比较源声明、导入基线和环境摘要，显示待导回源码、待部署或冲突及未启用版本数量。

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
      "minLength": 1
    }
  },
  "additionalProperties": false
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
  ],
  "additionalProperties": false
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
  },
  "additionalProperties": false
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
    "appSpecChangeId": {
      "description": "本次发布关联的 AppSpec 变更 ID；多个活动变更时显式指定，缺省时使用唯一活动变更",
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
    "appSpecChangeId": {
      "description": "本次发布关联的 AppSpec 变更 ID；多个活动变更时显式指定，缺省时使用唯一活动变更",
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
  },
  "additionalProperties": false
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

## application_diagnostics

查询应用原操作事实。在当前应用和明确环境内只读查询 requestId、commandId、deploymentRunId 或 fileId。requestId 必须传成对 UTC from/to，最多 24 小时；其余类型不传窗口。未观测到不表示未执行，禁止据此换键重放。

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
    "kind": {
      "type": "string",
      "enum": [
        "requestId",
        "commandId",
        "deploymentRunId",
        "fileId"
      ]
    },
    "id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128
    },
    "from": {
      "type": "string"
    },
    "to": {
      "type": "string"
    }
  },
  "required": [
    "kind",
    "id"
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
