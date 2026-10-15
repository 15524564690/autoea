# autoEA 策略组合器

拖拽式 EA（智能交易系统）策略搭建工具：在画布上组合**指标 → 条件 → 执行**，一键生成 **MQL4 / MQL5** 双平台代码，直接放进 MT4 / MT5 编译即可运行。

> 在线使用：**https://15524564690.github.io/autoea/**
> 纯前端应用，无后端、无数据库，策略数据保存在浏览器本地。

## 功能

- **三栏工作区**：左侧 EA 参数（名称 / 品种 / 周期 / 手数 / 止损止盈）、中间 React Flow 画布、右侧策略块库
- **策略块**：指标（RSI、MACD、EMA、布林带、Heikin-Ashi）、逻辑条件、执行动作（买入 / 卖出 / 平仓 / 加仓）
- **内置模板**：马丁格尔、网格策略，拖入画布即自动展开为完整预连线策略
- **自定义逻辑**：表单模式（选指标 + 比较符 + 阈值）或代码模式（手写 MQL 布尔表达式）
- **本地策略库**：保存 / 加载 / 删除策略（浏览器 localStorage）
- **代码生成**：切换 MQL4 / MQL5 标签页，支持复制与下载 `.mq4` / `.mq5`
- **生成前校验**：连线完整性、执行块缺失输入等错误会明确提示

## 本地开发

```bash
npm install
npm run dev          # http://localhost:5173
```

## 构建与测试

```bash
npm run build        # 类型检查 + 构建到 dist/（本地预览、自托管用）
npm run build:pages  # 以 /autoea/ 为 base 构建（GitHub Pages 用）
npm test             # vitest 单元测试
npm run preview      # 本地预览构建产物
```

## 部署

推送代码到 `main` 分支后，GitHub Actions 会自动构建并发布到 GitHub Pages，无需其他操作。流水线定义见 [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)。

自托管（Nginx / 宝塔 / IIS 等）：把 `dist/` 目录内容放到站点根目录即可，无需任何服务端配置。

## 生成代码说明

- 信号统一取**已收盘 K 线**（shift = 1），避免未来函数
- MQL5 使用指标句柄 + `CopyBuffer` 取值，相同创建参数的缓冲区**共享同一个句柄**，并在 `OnDeinit` 中 `IndicatorRelease` 释放
- 注意：MQL5 的 `iBands` 参数顺序为 `(period, bands_shift, deviation, price)`，与 MQL4 的 `(period, deviation, bands_shift, price, mode, shift)` 相反，已按各平台官方手册分别处理
- 魔术号按策略名生成，同一账户跑多个 EA 互不冲突

## 目录结构

```
src/
├── codegen/        # 校验 validate → IR 转换 toIR → 渲染 mql4/mql5、模板展开
├── components/     # 三栏 UI：配置面板、画布、块库、逻辑编辑器、代码预览
├── data/           # 内置策略块与模板定义
├── store/          # Zustand 全局状态
└── types.ts        # 配置 / IR / 块类型定义
```

## 免责声明

本项目仅生成策略代码，不构成任何投资建议。实盘前请务必先在 MT4/MT5 策略测试器中回测，并在模拟账户验证。外汇及差价合约交易风险极高，请自行承担全部风险。
