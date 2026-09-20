# Agent 评测平台（独立原型）

从万智 Studio 原型中拆出的独立评测平台。评测中心不再是万智内部模块，而是一个可独立运行的平台页面。

## 来源

- 原仓库：`/Users/admin/Documents/高保真原型/wanzhi_platform_production`
- 原分支：`feat/unified-studio-customization`
- 原路由：`/studio/evaluation`
- 迁移范围：`src/features/evaluation/` 下的 4 个文件，逐字节复制，未做修改。

## 运行

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 5174
npm run build
npm run lint
```

入口：`http://127.0.0.1:5174/`

## 结构

```text
src/
  App.tsx                          独立平台路由
  main.tsx                         应用入口
  index.css                        平台级全局样式
  platform/
    PlatformShell.tsx              独立平台外壳，替代原 DashboardLayout
    platform-shell.css             外壳样式与页面内边距
  features/evaluation/             评测中心（原样迁移）
    EvaluationCenterPage.tsx
    evaluation.css
    evaluation.types.ts
    evaluation.mock.ts
```

## 与万智原壳层的差异

- 不再使用 `DashboardLayout`，没有万智左侧导航和 Studio 品牌栏。
- 路由从 `/studio/evaluation` 改为 `/`。
- 原页面横向内边距由 `page-content` 提供（`16px 40px 32px 24px`），现由 `platform-shell__content` 等值复现。
- 评测中心自身的顶栏、模块导航和页面内容未改动。

## 当前边界

- 仍为可点击的产品原型，数据全部来自 `evaluation.mock.ts`，没有真实后端接口。
- 尚未接入多 Agent 来源（万智 + 第三方）、账号体系或 Langfuse 轨迹读取。
- 未推送远端。本仓库为本地 Git 仓库。
