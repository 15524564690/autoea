import type { BlockDef } from '../types';

const B = (b: Omit<BlockDef, 'builtin'> & { builtin?: boolean }): BlockDef => ({ builtin: true, ...b });

/** 全部内置策略块（自定义逻辑块由 store 里的 customBlocks 提供） */
export const BUILTIN_BLOCKS: BlockDef[] = [
  // —— 指标类：无输入，输出 signal ——
  B({
    id: 'rsi', kind: 'indicator', name: 'RSI 指标', icon: '📊',
    inputs: [], output: 'signal',
    params: [{ key: 'period', label: '周期', type: 'number', default: 14 }],
    description: '相对强弱指数',
  }),
  B({
    id: 'macd', kind: 'indicator', name: 'MACD 指标', icon: '📊',
    inputs: [], output: 'signal',
    params: [
      { key: 'fast', label: '快线', type: 'number', default: 12 },
      { key: 'slow', label: '慢线', type: 'number', default: 26 },
      { key: 'signal', label: '信号线', type: 'number', default: 9 },
      {
        key: 'line', label: '取值线', type: 'select', default: 'main',
        options: [{ value: 'main', label: 'DIF 主线' }, { value: 'signal', label: 'DEA 信号线' }],
      },
    ],
  }),
  B({
    id: 'ema', kind: 'indicator', name: 'EMA 均线', icon: '📊',
    inputs: [], output: 'signal',
    params: [{ key: 'period', label: '周期', type: 'number', default: 20 }],
  }),
  B({
    id: 'bb', kind: 'indicator', name: 'Bollinger Band', icon: '📊',
    inputs: [], output: 'signal',
    params: [
      { key: 'period', label: '周期', type: 'number', default: 20 },
      { key: 'deviation', label: '标准差', type: 'number', default: 2 },
      {
        key: 'band', label: '轨道', type: 'select', default: 'lower',
        options: [
          { value: 'upper', label: '上轨' },
          { value: 'middle', label: '中轨' },
          { value: 'lower', label: '下轨' },
        ],
      },
    ],
  }),
  B({
    id: 'ha', kind: 'indicator', name: 'Heikin Ashi', icon: '📊',
    inputs: [], output: 'signal',
    params: [
      {
        key: 'color', label: 'K线颜色', type: 'select', default: 'bull',
        options: [{ value: 'bull', label: '阳线' }, { value: 'bear', label: '阴线' }],
      },
    ],
    description: '输出 +1（阳）/ -1（阴），配合条件判断阈值 0 使用',
  }),

  // —— 逻辑类：输出 bool ——
  B({
    id: 'cond', kind: 'logic', name: '条件判断', icon: '🔀',
    inputs: ['signal'], output: 'bool',
    params: [
      {
        key: 'op', label: '比较', type: 'select', default: '<',
        options: [
          { value: '<', label: '< 小于' }, { value: '>', label: '> 大于' },
          { value: '<=', label: '≤ 小于等于' }, { value: '>=', label: '≥ 大于等于' },
          { value: '==', label: '= 等于' },
          { value: 'crossUp', label: '上穿阈值' }, { value: 'crossDown', label: '下穿阈值' },
        ],
      },
      { key: 'value', label: '阈值', type: 'number', default: 30 },
    ],
  }),
  B({
    id: 'and', kind: 'logic', name: 'And 组合', icon: '🔄',
    inputs: ['bool', 'bool'], output: 'bool', params: [],
    description: '两个条件同时成立',
  }),
  B({
    id: 'or', kind: 'logic', name: 'Or 组合', icon: '🔄',
    inputs: ['bool', 'bool'], output: 'bool', params: [],
    description: '任一条件成立',
  }),
  B({
    id: 'time', kind: 'logic', name: '时间过滤', icon: '⏳',
    inputs: [], output: 'bool',
    params: [
      { key: 'from', label: '开始', type: 'text', default: '08:00' },
      { key: 'to', label: '结束', type: 'text', default: '22:00' },
    ],
  }),

  // —— 执行类：输入 bool，无输出 ——
  B({
    id: 'buy', kind: 'execution', name: '买入订单', icon: '📥',
    inputs: ['bool'], output: null,
    params: [
      { key: 'lot', label: '手数', type: 'number', default: 0.01 },
      { key: 'sl', label: '止损(点,0=用全局)', type: 'number', default: 0 },
      { key: 'tp', label: '止盈(点,0=用全局)', type: 'number', default: 0 },
      { key: 'multiplier', label: '马丁倍数', type: 'number', default: 1 },
      { key: 'gridStep', label: '加仓间距(点)', type: 'number', default: 0 },
      { key: 'maxLayers', label: '最大层数', type: 'number', default: 1 },
    ],
  }),
  B({
    id: 'sell', kind: 'execution', name: '卖出订单', icon: '📥',
    inputs: ['bool'], output: null,
    params: [
      { key: 'lot', label: '手数', type: 'number', default: 0.01 },
      { key: 'sl', label: '止损(点,0=用全局)', type: 'number', default: 0 },
      { key: 'tp', label: '止盈(点,0=用全局)', type: 'number', default: 0 },
      { key: 'multiplier', label: '马丁倍数', type: 'number', default: 1 },
      { key: 'gridStep', label: '加仓间距(点)', type: 'number', default: 0 },
      { key: 'maxLayers', label: '最大层数', type: 'number', default: 1 },
    ],
  }),
  B({ id: 'closeBuy', kind: 'execution', name: '平多', icon: '🛑', inputs: ['bool'], output: null, params: [] }),
  B({ id: 'closeSell', kind: 'execution', name: '平空', icon: '🛑', inputs: ['bool'], output: null, params: [] }),
  B({ id: 'closeAll', kind: 'execution', name: '全平', icon: '🛑', inputs: ['bool'], output: null, params: [] }),

  // —— 完整策略模板：无端口，拖入画布展开成子图 ——
  B({
    id: 'tpl_martin', kind: 'template', name: 'Martin 格尔策略', icon: '🔥',
    inputs: [], output: null, params: [],
    description: 'RSI 超卖买入，倍数加仓摊平',
  }),
  B({
    id: 'tpl_grid', kind: 'template', name: '网格策略', icon: '📐',
    inputs: [], output: null, params: [],
    description: '固定间距等量加仓',
  }),
  B({
    id: 'tpl_trend', kind: 'template', name: '趋势跟踪', icon: '📈',
    inputs: [], output: null, params: [],
    description: 'MACD 主线上穿 0 轴做多 / 下穿做空（即 EMA 快慢线交叉）',
  }),
];

export const getBuiltinBlock = (id: string): BlockDef | undefined =>
  BUILTIN_BLOCKS.find((b) => b.id === id);
