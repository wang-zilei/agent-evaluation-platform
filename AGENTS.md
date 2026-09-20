# Agent 评测平台 交接说明

## 工作目录

```text
/Users/admin/Documents/高保真原型/agent_evaluation_platform
```

这是从万智 Studio 原型拆出的独立评测平台原型。原仓库
`/Users/admin/Documents/高保真原型/wanzhi_platform_production` 只读，不再修改。

## 常用命令

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 5174
npm run build
npm run lint
npm run test
```

## 产品背景（最高优先级）

评测平台已从「万智平台内部功能模块」调整为「独立平台」：

- 万智入口位置不变，点击后跳转到独立评测平台。
- 平台需支持接入万智 Agent 和外部第三方 Agent（已知需求方：平安银行）。
- Agent 不再限定为「当前万智用户自己创建的 Agent」，而是「已接入且当前用户有权限使用的 Agent」。
- 外部 Agent 轨迹建议复用 Langfuse 现有 SDK 采集，评测平台通过 Langfuse 读取 API 获取 Trace，不自研 SDK。
- 轨迹接入与 Agent 调用解耦：能读取 Trace 不等于能重新运行 Agent。

主 PRD `2.3 Agent 接入` 已记录上述方向，具体接口与权限方案仍待确认。

## 当前代码边界

- 全部数据来自 `src/features/evaluation/evaluation.mock.ts`，没有真实后端、模型或 Agent 调用。
- 评测对象仍是 Mock 的万智 Agent，尚未体现多来源 Agent 接入。
- 未接入账号体系、组织权限或 Langfuse。
- `src/features/evaluation/` 下的 4 个文件是从原仓库逐字节复制，除必要修复外不要改写既有交互逻辑。

## 已知待办

1. 按独立平台重做 Agent 接入与权限模型（对应 PRD 2.3）。
2. 增加数据来源标识，区分万智 Agent 与第三方 Agent。
3. 真实轨迹接入方案（Langfuse 读取 API / OTLP）待确认后实现。

## 协作约束

- 默认使用简体中文。
- 先读取当前代码，再做局部修改；不擅自接入后端、真实模型或在线服务。
- 修改后至少运行 `npm run build` 和 `npm run lint`；涉及交互时用浏览器实际点击验证。
- 每次修改前端代码后创建一次本地 Git commit；不推送远端，除非用户明确要求。
