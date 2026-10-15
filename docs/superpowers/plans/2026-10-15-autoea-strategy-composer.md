# autoEA 策略组合器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三栏可视化 EA 策略组合网站：右侧策略块拖入中间画布、端口连线组成策略，一键生成 MQL4/MQL5 代码并下载。

**Architecture:** 纯前端 SPA。React Flow 承载节点画布；Zustand 管理状态并持久化到 localStorage；代码生成分三步：图校验 → 拓扑编译为平台无关 IR → MQL4/MQL5 两套渲染器输出。

**Tech Stack:** Vite + React 18 + TypeScript + @xyflow/react + Zustand + Vitest

**Spec:** `docs/superpowers/specs/2026-10-15-autoea-strategy-composer-design.md`

---

## File Structure

```
e:\trae\autoEA\
├── package.json / tsconfig.json / vite.config.ts / index.html
└── src/
    ├── main.tsx, App.tsx, styles/global.css     # 壳 + 深色主题
    ├── types.ts                                  # BlockDef / CanvasNode / EAConfig / IR
    ├── store/useStore.ts                         # Zustand + localStorage 持久化
    ├── data/builtinBlocks.ts                     # 内置块定义（指标/逻辑/执行/模板）
    ├── components/
    │   ├── EAConfigPanel.tsx                     # 左栏
    │   ├── FlowCanvas.tsx                        # 中间画布 + 工具栏
    │   ├── nodes/BlockNode.tsx                   # 自定义节点（端口/参数/删除）
    │   ├── BlockLibrary.tsx                      # 右栏（搜索/分类/拖拽源）
    │   ├── LogicEditorModal.tsx                  # 新增逻辑（表单/代码混合）
    │   └── CodePreviewModal.tsx                  # 预览/下载（MQL4/MQL5 Tab）
    └── codegen/
        ├── types (in src/types.ts)               # IR 类型
        ├── validate.ts                           # 图校验（错误/警告）
        ├── toIR.ts                               # 画布图 → IR
        ├── mql4.ts                               # IR → MQL4
        ├── mql5.ts                               # IR → MQL5
        ├── templateExpand.ts                     # 模板块展开子图
        ├── index.ts                              # generateCode() 入口
        └── __tests__/                            # vitest
```

## 核心类型（src/types.ts，全部任务的契约）

```ts
export type PortType = 'signal' | 'bool' | 'exec';
export type BlockKind = 'indicator' | 'logic' | 'execution' | 'template';

export interface ParamDef {
  key: string; label: string;
  type: 'number' | 'select' | 'text';
  default: string | number;
  options?: { value: string; label: string }[];
}

export interface BlockDef {
  id: string; kind: BlockKind; name: string; icon: string;
  builtin: boolean;
  inputs: PortType[];        // 左侧输入端口类型（顺序即端口顺序）
  output: PortType | null;   // 右侧输出口
  params: ParamDef[];
  custom?: CustomPayload;    // 自定义逻辑块专属
  description?: string;
}

export type CustomPayload =
  | { mode: 'form'; condition: IRCondition }        // 表单模式 → 存 IR 条件
  | { mode: 'code'; mql: string };                  // 代码模式 → 存 MQL 布尔表达式片段

export interface EAConfig {
  name: string; symbol: string; timeframe: string;
  lotSize: number; sl: number; tp: number;
}

// —— IR ——

export type CompareOp = '<' | '>' | '<=' | '>=' | '==' | 'crossUp' | 'crossDown';

export interface IndicatorSpec {
  func: 'RSI' | 'MACD' | 'EMA' | 'BB' | 'HA';
  params: Record<string, number | string>;
}

export type IRCondition =
  | { type: 'compare'; indicator: IndicatorSpec; op: CompareOp; value: number }
  | { type: 'and'; left: IRCondition; right: IRCondition }
  | { type: 'or'; left: IRCondition; right: IRCondition }
  | { type: 'time'; from: string; to: string }      // "HH:MM"
  | { type: 'custom'; code: string };               // 自定义代码模式

export interface IRAction {
  type: 'buy' | 'sell' | 'closeBuy' | 'closeSell' | 'closeAll';
  lot: number; sl: number; tp: number;
  multiplier: number;   // 马丁加仓倍数，1 = 关闭
  gridStep: number;     // 加仓间距(点)，0 = 关闭；马丁=倍数+间距两用
  maxLayers: number;    // 最大层数
}

export interface IRBranch { when: IRCondition | null; actions: IRAction[]; }
export interface StrategyIR { branches: IRBranch[]; indicators: IndicatorSpec[]; }
```

**端口规则**：`signal`（指标输出）只能连 `logic` 块的 signal 输入；`bool` 输出连 `logic/execution` 的 bool 输入；`exec` 预留。指标块 output=signal；条件判断 input=[signal] output=bool；And/Or input=[bool,bool] output=bool；时间过滤 output=bool；执行块 input=[bool]。

**连线合法性**：`sourcePort.type === targetPort.type` 且目标端口未被占用（除 And/Or 的两个 bool 口按索引对应）。

**马丁/网格统一机制**：买入/卖出节点的 `gridStep>0` 时加仓（间距触发），`multiplier>1` 时手数按倍数递增，`maxLayers` 限层。马丁模板预设 multiplier=2、gridStep=200、maxLayers=5；网格模板预设 multiplier=1、gridStep=300、maxLayers=10。

---

### Task 1: 项目脚手架

**Files:** Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/global.css`

- [ ] 手写 package.json（deps: react, react-dom, @xyflow/react, zustand; devDeps: typescript, vite, @vitejs/plugin-react, vitest, @types/react, @types/react-dom），scripts: dev/build/test
- [ ] `npm install`
- [ ] 最小 App 渲染 "autoEA"，`npm run build` 通过，`npx vitest run` 空跑通过
- [ ] Commit: `chore: 项目脚手架`

### Task 2: 类型与内置块定义

**Files:** Create: `src/types.ts`, `src/data/builtinBlocks.ts`

- [ ] 按"核心类型"写入 types.ts
- [ ] builtinBlocks.ts：定义内置块 ——
  指标：RSI(周期14/超买70/超卖30)、MACD(快12/慢26/信号9/line main|signal)、EMA(周期20)、BB(周期20/偏差2/upper|lower|middle)、HA(bull|bear)
  逻辑：条件判断(比较符7种+阈值)、And组合、Or组合、时间过滤(from/to)
  执行：买入(手数0.01/SL/TP/倍数1/间距0/层数1)、卖出(同)、平多、平空、全平
  模板：马丁格尔(martin)、网格(grid)、趋势跟踪(trend) —— kind='template'，不带端口
- [ ] Commit: `feat: 类型与内置策略块定义`

### Task 3: Zustand store + 持久化

**Files:** Create: `src/store/useStore.ts`

- [ ] State: `eaConfig, nodes, edges, customBlocks, savedStrategies` + actions: `setConfig, addNode(blockDef,pos), updateNodeParams(id,params), onConnect, removeNode, removeEdge, clearCanvas, addCustomBlock, deleteCustomBlock, saveStrategy(name), loadStrategy(id), deleteStrategy(id)`
- [ ] persist 中间件：customBlocks/savedStrategies → `autoea.custom_blocks`/`autoea.strategies`；nodes/edges/eaConfig 每次变更写 `autoea.last_draft`（手动 JSON，启动时恢复）；try/catch 包 localStorage，失败降级内存并 console.warn
- [ ] onConnect 做端口类型+占用校验（不合法则拒绝）
- [ ] Commit: `feat: zustand store 与 localStorage 持久化`

### Task 4: 代码生成器 — 校验（TDD）

**Files:** Create: `src/codegen/validate.ts`, `src/codegen/__tests__/validate.test.ts`

- [ ] 先写失败测试：无执行块 → `errors` 含 `no-execution`；执行块缺 bool 输入 → `missing-input`；环 → `cycle`；孤立节点 → `warnings` 含 `orphan`
- [ ] `npx vitest run` 确认 FAIL
- [ ] 实现 `validateGraph(nodes, edges): { errors: string[]; warnings: string[] }`（DFS 检环 + 反向可达性查孤立）
- [ ] 测试 PASS，Commit: `feat: 策略图校验`

### Task 5: 图 → IR（TDD）

**Files:** Create: `src/codegen/toIR.ts`, `src/codegen/__tests__/toIR.test.ts`

- [ ] 先写失败测试：RSI→条件(<30)→买入 编译为 1 branch{when:compare, actions:[buy]}；两个条件经 And 合并；OR 分支；自定义 code 块 → `{type:'custom'}`；时间过滤正确
- [ ] 实现：从每个执行节点沿 bool 输入反向递归构建条件树（signal 输入沿边找指标节点 → IndicatorSpec）；收集全部 IndicatorSpec 去重
- [ ] 测试 PASS，Commit: `feat: 画布图编译为 IR`

### Task 6: MQL4 渲染器（TDD）

**Files:** Create: `src/codegen/mql4.ts`, `src/codegen/__tests__/mql4.test.ts`

- [ ] 先写失败快照测试：compare(RSI<30)+buy → 含 `iRSI(Symbol(), PERIOD_CURRENT, 14, PRICE_CLOSE, 1) < 30` 与 `OrderSend(...OP_BUY...)`；马丁参数 → 含加仓函数调用；HA 使用 → 生成 `HA_Color()` helper
- [ ] 实现 `renderMQL4(config, ir): string`：模板字面量组装 OnInit/OnTick/OnDeinit；条件树递归转布尔表达式；执行动作生成带 magic 的订单管理代码；time 条件用 `TimeHour()`/`TimeMinute()`
- [ ] 测试 PASS，Commit: `feat: MQL4 渲染器`

### Task 7: MQL5 渲染器（TDD）

**Files:** Create: `src/codegen/mql5.ts`, `src/codegen/__tests__/mql5.test.ts`

- [ ] 先写失败快照测试：同一 IR → OnInit 含 `rsiHandle = iRSI(_Symbol, PERIOD_CURRENT, 14, PRICE_CLOSE)`，OnTick 含 `CopyBuffer(rsiHandle, 0, 1, 1, buf)`；buy → `CTrade trade; trade.Buy(...)`
- [ ] 实现 `renderMQL5(config, ir): string`：指标声明为 OnInit 句柄 + OnTick CopyBuffer 数组；其余结构对齐 mql4
- [ ] 测试 PASS，Commit: `feat: MQL5 渲染器`

### Task 8: 模板展开（TDD）

**Files:** Create: `src/codegen/templateExpand.ts`, `src/codegen/__tests__/templateExpand.test.ts`

- [ ] 先写失败测试：expandTemplate('martin') → 返回 RSI+条件+买入 三节点预连线，买入节点 multiplier=2/gridStep=200/maxLayers=5；grid → multiplier=1/gridStep=300/maxLayers=10；trend → EMA 快慢交叉+买入/卖出
- [ ] 实现 `expandTemplate(id, origin): {nodes, edges}`（相对 origin 偏移布点，节点 id 用 nanoid 风格自增）
- [ ] 测试 PASS，Commit: `feat: 策略模板展开`

### Task 9: 应用壳与三栏布局

**Files:** Create/Modify: `src/App.tsx`, `src/styles/global.css`, `src/main.tsx`

- [ ] App = flex 三栏（220px | flex:1 | 240px），深色主题（#131722 画布 / #1e222d 面板 / #2962ff 主色）
- [ ] 顶部 36px 工具栏由 FlowCanvas 内部承载；左中右以组件占位接入
- [ ] Commit: `feat: 三栏布局壳`

### Task 10: 左栏 EAConfigPanel

**Files:** Create: `src/components/EAConfigPanel.tsx`

- [ ] 表单绑定 store.eaConfig：名称/品种(select EURUSD等)/周期(M5..H4)/手数(默认0.01)/SL/TP；底部"▶ 生成 EA 代码"按钮（触发 CodePreview 弹窗，由 App 级 state 控制开关）
- [ ] 底部追加"已保存策略"列表（加载/删除）
- [ ] Commit: `feat: 左栏 EA 配置面板`

### Task 11: 中间画布 FlowCanvas + BlockNode

**Files:** Create: `src/components/FlowCanvas.tsx`, `src/components/nodes/BlockNode.tsx`

- [ ] ReactFlow + 自定义 nodeType `block`；onDrop（HTML5 dnd，dataTransfer 传 blockId）→ screenToFlowPosition → addNode；模板块拖入则调 templateExpand 展开成子图
- [ ] BlockNode：头部 icon+名称（按 kind 着色：指标蓝/逻辑橙/执行绿/模板紫），body 内联渲染参数输入（number/select），左输入口/右输出口按端口类型着色（signal 蓝、bool 橙、exec 绿），右上 × 删除
- [ ] 连线校验走 store.onConnect；isConnectable 按端口类型；Delete 键删选中；工具栏：未保存标记/保存策略/清空
- [ ] Commit: `feat: 画布与自定义节点`

### Task 12: 右栏 BlockLibrary

**Files:** Create: `src/components/BlockLibrary.tsx`

- [ ] 搜索框过滤（name 含关键字，不区分大小写）；分组渲染 指标/逻辑/执行/我的自定义/模板；条目 draggable，dragstart 写 dataTransfer('application/autoea-block', blockId)
- [ ] "＋ 新增逻辑"按钮打开 LogicEditorModal
- [ ] Commit: `feat: 右栏策略块库`

### Task 13: LogicEditorModal（表单/代码混合）

**Files:** Create: `src/components/LogicEditorModal.tsx`

- [ ] 模式切换 Tab：表单（名称、指标下拉、比较符、阈值 → 组装 IRCondition 存 custom.mode='form'）/ 代码（textarea 输入 MQL 布尔表达式，存 custom.mode='code'）
- [ ] 保存 → addCustomBlock（kind='logic', inputs=['signal']或[], output='bool'）；代码模式无 signal 输入口
- [ ] Commit: `feat: 自定义逻辑编辑器`

### Task 14: CodePreviewModal + generateCode 入口

**Files:** Create: `src/components/CodePreviewModal.tsx`, `src/codegen/index.ts`

- [ ] index.ts: `generateCode(config, nodes, edges, customBlocks) → { mql4?: string; mql5?: string; errors: string[]; warnings: string[] }`（先展开自定义 form 块为条件，再 validate → toIR → 双渲染器）
- [ ] Modal：错误红色列表（有错则禁用下载）；MQL4/MQL5 Tab + `<pre>` 代码；复制按钮 + Blob 下载 `名称.mq4/.mq5`；警告黄色列表
- [ ] Commit: `feat: 代码预览与下载`

### Task 15: 全流程浏览器验收

**Files:** 无新增（修缺陷）

- [ ] `npm run dev` 起服务，浏览器验证：拖 RSI→条件→买入 并连线 → 生成 MQL4/5 代码正确；拖马丁模板展开；新增自定义逻辑并复用；保存/刷新/加载策略；搜索过滤；非法连线被拒
- [ ] `npm run build` + `npx vitest run` 全绿
- [ ] Commit: `chore: 全流程验收修正`

---

## Self-Review

- **Spec 覆盖**：三栏布局(T9-12)、搜索+新增逻辑(T12-13)、混合编辑器(T13)、双平台生成(T6-7,14)、马丁/网格/趋势模板(T8)、localStorage(T3,10)、校验(T4,11)、测试(T4-8,15) —— 无缺口
- **占位符**：无 TBD/TODO；所有任务含具体文件与验收标准
- **类型一致性**：BlockDef/IR 定义见"核心类型"一节，codegen 各任务均引用该契约
