import type { Node } from '@xyflow/react';

// —— 端口与块 ——

export type PortType = 'signal' | 'bool' | 'exec';
export type BlockKind = 'indicator' | 'logic' | 'execution' | 'template';

export interface ParamDef {
  key: string;
  label: string;
  type: 'number' | 'select' | 'text';
  default: string | number;
  options?: { value: string; label: string }[];
}

export interface BlockDef {
  id: string;
  kind: BlockKind;
  name: string;
  icon: string;
  builtin: boolean;
  /** 左侧输入端口类型（顺序即端口自上而下） */
  inputs: PortType[];
  /** 右侧输出口类型，null 表示无输出口 */
  output: PortType | null;
  params: ParamDef[];
  /** 自定义逻辑块专属载荷 */
  custom?: CustomPayload;
  description?: string;
}

export type CustomPayload =
  | { mode: 'form'; condition: IRCondition }
  | { mode: 'code'; mql: string };

// —— EA 配置 ——

export interface EAConfig {
  name: string;
  symbol: string;
  timeframe: string;
  lotSize: number;
  sl: number;
  tp: number;
}

// —— IR（平台无关中间表示）——

export type CompareOp = '<' | '>' | '<=' | '>=' | '==' | 'crossUp' | 'crossDown';

export interface IndicatorSpec {
  func: 'RSI' | 'MACD' | 'EMA' | 'BB' | 'HA';
  params: Record<string, number | string>;
}

export type IRCondition =
  | { type: 'compare'; indicator: IndicatorSpec; op: CompareOp; value: number }
  | { type: 'and'; left: IRCondition; right: IRCondition }
  | { type: 'or'; left: IRCondition; right: IRCondition }
  | { type: 'time'; from: string; to: string }
  | { type: 'custom'; code: string };

export interface IRAction {
  type: 'buy' | 'sell' | 'closeBuy' | 'closeSell' | 'closeAll';
  lot: number;
  sl: number;
  tp: number;
  /** 马丁加仓倍数，1 = 关闭 */
  multiplier: number;
  /** 加仓间距（点），0 = 关闭 */
  gridStep: number;
  /** 最大层数 */
  maxLayers: number;
}

export interface IRBranch {
  when: IRCondition | null;
  actions: IRAction[];
}

export interface StrategyIR {
  branches: IRBranch[];
  /** 画布中用到的全部指标（去重），供 MQL5 句柄生成 */
  indicators: IndicatorSpec[];
}

// —— 画布数据（React Flow）——

export interface BlockNodeData {
  block: BlockDef;
  params: Record<string, string | number>;
  [key: string]: unknown;
}

export type BlockFlowNode = Node<BlockNodeData, 'block'>;

export interface SavedStrategy {
  id: string;
  name: string;
  savedAt: number;
  eaConfig: EAConfig;
  nodes: BlockFlowNode[];
  edges: CanvasEdge[];
}

/** React Flow 边，带端口类型便于校验 */
export interface CanvasEdge {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
  [key: string]: unknown;
}

// —— 代码生成结果 ——

export interface CodegenResult {
  mql4?: string;
  mql5?: string;
  errors: string[];
  warnings: string[];
}
