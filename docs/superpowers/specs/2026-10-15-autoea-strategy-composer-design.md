# autoEA 策略组合器 — 设计文档

日期：2026-10-15
状态：已确认

## 1. 目标

一个纯前端网站，用于可视化组合 EA 策略：三栏布局（左：自定义 EA 配置，中：拖拽画布，右：已有策略块库）。用户把右侧策略块拖到中间画布，通过端口连线组成新策略，最终一键生成 MQL4 / MQL5 的 EA 代码并下载。

## 2. 关键决策

| 决策点 | 结论 |
|--------|------|
| 目标平台 | MQL4 与 MQL5 都支持（同一策略图分别导出） |
| 新增逻辑编辑器 | 混合式：默认表单模式，可切换代码模式 |
| 数据保存 | 纯前端 + localStorage |
| 技术栈 | Vite + React 18 + TypeScript + @xyflow/react + Zustand |
| 初始手数 | 固定 0.01 起步 |
| 环境 | Node v24 / npm 11 |

## 3. 模块划分

- **EAConfigPanel**（左栏）：EA 名称、交易品种、时间周期、初始手数（0.01）、SL/TP 风控参数；底部"生成 EA 代码"按钮。
- **FlowCanvas**（中间画布）：React Flow 画布。右栏拖入节点、端口连线（贝塞尔）、节点拖动/删除、缩放平移；顶部工具栏：保存策略、清空。
- **BlockLibrary**（右栏）：顶部搜索框（实时过滤）；分类：指标类 / 逻辑类 / 执行类 / 我的自定义逻辑 / 完整策略模板；"＋ 新增逻辑"按钮打开 LogicEditor。
- **LogicEditor**（弹窗）：混合式编辑器。表单模式 = 选择指标、比较符、阈值参数；代码模式 = 直接编辑 MQL 片段。保存后进入"我的自定义逻辑"分类，可拖拽复用。
- **CodePreview**（弹窗）：生成前先校验 → MQL4 / MQL5 两个 Tab 预览 → 下载 .mq4 / .mq5。

## 4. 数据模型

```ts
type BlockKind = 'indicator' | 'logic' | 'execution' | 'template';

interface BlockDef {          // 库中的一个策略块（内置或自定义）
  id: string;
  kind: BlockKind;
  category: string;           // 展示分类
  name: string;
  icon: string;
  params: ParamDef[];         // 参数声明
  builtinMql?: string;        // 代码模式自定义片段
}

interface CanvasNode {        // 画布节点 = BlockDef 实例
  id: string;
  blockId: string;
  position: {x, y};
  params: Record<string, string|number>;
}

interface Edge { source: string; target: string; }  // 连线

interface EAConfig {
  name: string; symbol: string; timeframe: string;
  lotSize: number;            // 初始 0.01
  sl: number; tp: number;
}
```

- Zustand store：`eaConfig`、`nodes`、`edges`、`customBlocks`、`savedStrategies`。
- localStorage keys：`autoea.custom_blocks`、`autoea.strategies`、`autoea.last_draft`（自动草稿）。

## 5. 代码生成（核心）

1. **校验**：图必须有执行类终点；条件/逻辑块必须有指标或逻辑输入；孤立节点警告；连线成环拒绝。
2. **图 → IR**：对画布拓扑排序，编译成与平台无关的 IR（条件树 + 动作序列）。
3. **IR → MQL4 / MQL5**：两套模板引擎分别渲染标准 EA 骨架 `OnInit` / `OnTick` / `OnDeinit`。
   - MT4：直接 `iRSI(...)` 等调用。
   - MT5：`iRSI()` 创建句柄（OnInit 中），OnTick 中 `CopyBuffer` 取值。
4. **内置块**：指标（RSI/MACD/EMA/Bollinger/Heikin Ashi）、逻辑（条件判断/And-Or 组合/时间过滤）、执行（买入/卖出/平仓止损/止盈）、模板（马丁、网格、趋势跟踪 —— 拖入后展开成预连线的可编辑子图）。
5. 马丁/网格模板的加仓倍数、最大层数等在节点参数中可配。

## 6. 校验与错误处理

- 生成前校验失败 → CodePreview 中列出错误，不生成。
- 端口类型检查：指标输出 → 逻辑输入；逻辑输出 → 逻辑/执行输入；拖错端口拒绝吸附。
- localStorage 不可用（隐私模式/超配额）→ 降级为内存运行并提示。

## 7. 测试

- Vitest：图→IR 编译、各内置块 MQL4/MQL5 输出快照、校验规则。
- UI 交互（拖拽/连线/保存/加载）浏览器手动验收。

## 8. 范围外

- 后端/多设备同步、回测功能、自动交易执行 —— 本期均不做。
