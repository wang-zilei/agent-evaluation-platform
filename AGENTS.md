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

## 线上预览与发布

- 短期线上地址：`https://wang-zilei.github.io/agent-evaluation-platform/`。
- 源码分支：`codex/code-evaluator-redesign`；发布仓库：`wang-zilei/agent-evaluation-platform`，只放静态构建产物，`main` 作为 GitHub Pages 来源。
- 发布前构建：`npx tsc -b && npx vite build --base=/agent-evaluation-platform/`。
- 发布目录：`/tmp/agent-evaluation-platform-pages`。复制新的 `dist/index.html` 和 `dist/assets/*` 到该目录；不要用 `rm -rf` 清空。对不再被 `index.html` 引用的旧 hash 资源用 `git rm`，保留 `.nojekyll` 和 `404.html`。
- 临时目录里的 git credential helper 可能指向失效的旧 gh 路径；推送用 `git -c credential.helper='!/opt/homebrew/bin/gh auth git-credential' push origin main`。
- `src/App.tsx` 的 Router basename 使用 `import.meta.env.BASE_URL`，这是 GitHub Pages 子路径可用所必需的，不要回退。
- 发布后用 HTTP 200 校验 `index.html`、新 JS 和新 CSS；CSS 校验完成不代表页面一定已刷新，交互改动还要实际打开页面确认。

## 产品背景（最高优先级）

评测平台已从「万智平台内部功能模块」调整为「独立平台」：

- 万智入口位置不变，点击后跳转到独立评测平台。
- 平台需支持接入万智 Agent 和外部第三方 Agent（已知需求方：平安银行）。
- Agent 不再限定为「当前万智用户自己创建的 Agent」，而是「已接入且当前用户有权限使用的 Agent」。
- 外部 Agent 轨迹建议复用 Langfuse 现有 SDK 采集，评测平台通过 Langfuse 读取 API 获取 Trace，不自研 SDK。
- 轨迹接入与 Agent 调用解耦：能读取 Trace 不等于能重新运行 Agent。

主 PRD `2.3 Agent 接入` 已记录上述方向，具体接口与权限方案仍待确认。

## 当前代码边界

- 全部数据来自 `src/features/evaluation/` 下的 Mock 文件，没有真实后端、模型或 Agent 调用。
- 评测对象使用 Mock 数据展示万智和外部 Agent 来源，但没有真实注册、鉴权或 Trace 读取。
- 未接入账号体系、组织权限或 Langfuse。
- `src/features/evaluation/` 是当前独立原型的活跃代码，按现有组件和 Mock 数据结构增量修改。

## 优化报告当前口径

- Agent 优化首 Tab 为“优化报告”，结构为：报告摘要、评估器独立结果、归因标签、优化动作、可展开的 Badcase 证据。首屏暂不展示 Agent 配置前后 Diff。
- 被测 Agent 的人工标注只作为分析证据：展示覆盖率、自动结论一致性、关联数量，以及 Case 的人工标签/结果/原因；无标注显示“未标注”，不得补默认结论。当前不加入候选结果人工复验。
- 评估器优化对象包括模型评估器和 Agent 评估器，首 Tab 同样为“优化报告”，展示人工校准结果、误差归因、优化动作和评估器执行轨迹。
- 评估器轨迹只用于优化报告定位：模型评估器展示上下文、模型判断和结果解析；Agent 评估器展示 Trace、Skill、工具/MCP、模型判断和输出。不要在观测模块新增评估器轨迹入口。
- 评估器版本通过候选评估器重跑人工校准 Case 验证。数值分差不超过 `0.1`、通过型完全一致视为命中；少于 5 条需全部命中，5 条及以上要求至少 80%，并继续检查回归一致性和新增影响。

## 已知待办

1. 按独立平台落地 Agent 注册、来源标识和权限模型（对应 PRD 2.3）。
2. 补齐注册表单校验、编辑、停用和权限控制。
3. 真实轨迹接入方案（Langfuse 读取 API / OTLP）待确认后实现。

## 协作约束

- 默认使用简体中文。
- 先读取当前代码，再做局部修改；不擅自接入后端、真实模型或在线服务。
- 修改后至少运行 `npm run build` 和 `npm run lint`；涉及交互时用浏览器实际点击验证。
- 局部样式修复必须限定作用域。例如评测任务向导内的按钮对齐只改 `.eval-task-form-row--action` 下的选择器，不能顺带改评测集列表工具栏的同名按钮。
- 优化报告改造必须同时覆盖有标注和无标注数据；空标注不能阻断报告或生成默认结论。
- 每次修改前端代码后创建一次本地 Git commit；不推送远端，除非用户明确要求。
