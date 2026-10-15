import { describe, expect, it } from 'vitest';
import { generateCode } from '../index';
import type { BlockFlowNode, CanvasEdge } from '../../types';
import { getBuiltinBlock } from '../../data/builtinBlocks';

const cfg = {
  name: 'DemoEA',
  symbol: 'EURUSD',
  timeframe: 'M15',
  lotSize: 0.01,
  sl: 50,
  tp: 100,
} as const;

function node(id: string, blockId: string, paramOverride: Record<string, string | number> = {}): BlockFlowNode {
  const block = getBuiltinBlock(blockId)!;
  const params = { ...Object.fromEntries(block.params.map((p) => [p.key, p.default])), ...paramOverride };
  return { id, type: 'block', position: { x: 0, y: 0 }, data: { block, params } };
}

function edge(source: string, target: string): CanvasEdge {
  return { id: `e_${source}_${target}`, source, target, sourceHandle: 'out', targetHandle: 'in-0' };
}

describe('generateCode', () => {
  it('合法图：输出 MQL4 与 MQL5 双代码', () => {
    const nodes = [node('a', 'rsi'), node('b', 'cond'), node('c', 'buy')];
    const edges = [edge('a', 'b'), edge('b', 'c')];
    const r = generateCode(cfg, nodes, edges);

    expect(r.errors).toHaveLength(0);
    expect(r.mql4).toContain('iRSI(Symbol()');
    expect(r.mql5).toContain('rsiHandle = iRSI(');
  });

  it('非法图：返回错误且不生成代码', () => {
    const r = generateCode(cfg, [node('a', 'rsi')], []);
    expect(r.errors).toContain('no-execution');
    expect(r.mql4).toBeUndefined();
    expect(r.mql5).toBeUndefined();
  });
});
