import type {
  BlockDef,
  BlockFlowNode,
  CanvasEdge,
  CompareOp,
  IRAction,
  IRCondition,
  IndicatorSpec,
  StrategyIR,
} from '../types';

/**
 * 画布图 → 平台无关 IR。
 * 前置条件：图已通过 validateGraph（无 cycle、无 missing-input）。
 */
export function toIR(nodes: BlockFlowNode[], edges: CanvasEdge[]): StrategyIR {
  const indicators: IndicatorSpec[] = [];
  const seen = new Set<string>();

  const rememberIndicator = (spec: IndicatorSpec): IndicatorSpec => {
    const key = JSON.stringify(spec);
    if (!seen.has(key)) {
      seen.add(key);
      indicators.push(spec);
    }
    return spec;
  };

  const execNodes = nodes.filter((n) => n.data.block.kind === 'execution');

  const branches = execNodes.map((exec) => {
    const upstream = incomingSource(exec.id, 'in-0');
    return {
      when: upstream ? buildCondition(upstream.id, new Set()) : null,
      actions: [buildAction(exec)],
    };
  });

  return { branches, indicators };

  // —— 沿 bool 输入反向递归构建条件树 ——

  function buildCondition(nodeId: string, visiting: Set<string>): IRCondition | null {
    if (visiting.has(nodeId)) return null; // 环保护（validate 已拦截，双保险）
    visiting.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    const block = node.data.block;
    const params = node.data.params;

    if (block.kind === 'logic') {
      switch (block.id) {
        case 'cond': {
          const src = incomingSource(nodeId, 'in-0');
          if (!src) return null;
          return {
            type: 'compare',
            indicator: indicatorSpecOf(src, rememberIndicator),
            op: params.op as CompareOp,
            value: Number(params.value),
          };
        }
        case 'and': {
          const l = incomingSource(nodeId, 'in-0');
          const r = incomingSource(nodeId, 'in-1');
          const lc = l ? buildCondition(l.id, visiting) : null;
          const rc = r ? buildCondition(r.id, visiting) : null;
          if (lc && rc) return { type: 'and', left: lc, right: rc };
          return lc ?? rc; // 单侧缺失时退化为另一侧（validate 已拦截缺失输入，此处双保险）
        }
        case 'or': {
          const l = incomingSource(nodeId, 'in-0');
          const r = incomingSource(nodeId, 'in-1');
          const lc = l ? buildCondition(l.id, visiting) : null;
          const rc = r ? buildCondition(r.id, visiting) : null;
          if (lc && rc) return { type: 'or', left: lc, right: rc };
          return lc ?? rc;
        }
        case 'time':
          return { type: 'time', from: String(params.from), to: String(params.to) };
        default: {
          // 自定义逻辑块
          if (block.custom?.mode === 'form') return block.custom.condition;
          if (block.custom?.mode === 'code') return { type: 'custom', code: block.custom.mql };
          return null;
        }
      }
    }
    return null;
  }

  function incomingSource(nodeId: string, handle: string): BlockFlowNode | undefined {
    const e = edges.find((x) => x.target === nodeId && (x.targetHandle ?? 'in-0') === handle);
    if (!e) return undefined;
    return nodes.find((n) => n.id === e.source);
  }

  function buildAction(exec: BlockFlowNode): IRAction {
    const p = exec.data.params;
    const type = exec.data.block.id as IRAction['type'];
    return {
      type,
      lot: Number(p.lot ?? 0),
      sl: Number(p.sl ?? 0),
      tp: Number(p.tp ?? 0),
      multiplier: Number(p.multiplier ?? 1),
      gridStep: Number(p.gridStep ?? 0),
      maxLayers: Number(p.maxLayers ?? 1),
    };
  }
}

function indicatorSpecOf(
  node: BlockFlowNode,
  remember: (spec: IndicatorSpec) => IndicatorSpec
): IndicatorSpec {
  const p = node.data.params;
  let spec: IndicatorSpec;
  switch (node.data.block.id) {
    case 'rsi':
      spec = { func: 'RSI', params: { period: Number(p.period) } };
      break;
    case 'macd':
      spec = { func: 'MACD', params: { fast: Number(p.fast), slow: Number(p.slow), signal: Number(p.signal), line: String(p.line) } };
      break;
    case 'ema':
      spec = { func: 'EMA', params: { period: Number(p.period) } };
      break;
    case 'bb':
      spec = { func: 'BB', params: { period: Number(p.period), deviation: Number(p.deviation), band: String(p.band) } };
      break;
    case 'ha':
      spec = { func: 'HA', params: { color: String(p.color) } };
      break;
    default:
      spec = { func: 'EMA', params: { period: 20 } };
  }
  return remember(spec);
}

/** 自定义逻辑块的辅助类型守卫（供 UI / codegen 复用） */
export const isCustomLogic = (b: BlockDef): boolean =>
  b.kind === 'logic' && !!b.custom;
