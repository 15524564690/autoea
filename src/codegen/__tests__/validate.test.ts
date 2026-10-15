import { describe, expect, it } from 'vitest';
import { validateGraph } from '../validate';
import type { BlockFlowNode, CanvasEdge } from '../../types';
import { getBuiltinBlock } from '../../data/builtinBlocks';

function node(id: string, blockId: string): BlockFlowNode {
  const block = getBuiltinBlock(blockId)!;
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    data: { block, params: Object.fromEntries(block.params.map((p) => [p.key, p.default])) },
  };
}

function edge(source: string, target: string, targetHandle = 'in-0'): CanvasEdge {
  return { id: `e_${source}_${target}`, source, target, sourceHandle: 'out', targetHandle };
}

describe('validateGraph', () => {
  it('空画布：报 no-execution', () => {
    const r = validateGraph([], []);
    expect(r.errors).toContain('no-execution');
  });

  it('只有指标没有执行块：报 no-execution', () => {
    const r = validateGraph([node('a', 'rsi')], []);
    expect(r.errors).toContain('no-execution');
  });

  it('RSI→条件→买入：无错误', () => {
    const nodes = [node('a', 'rsi'), node('b', 'cond'), node('c', 'buy')];
    const edges = [edge('a', 'b'), edge('b', 'c')];
    const r = validateGraph(nodes, edges);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it('执行块缺 bool 输入：报 missing-input', () => {
    const r = validateGraph([node('c', 'buy')], []);
    expect(r.errors.some((e) => e.startsWith('missing-input:c'))).toBe(true);
  });

  it('And 只连了一个输入：报 missing-input', () => {
    const nodes = [node('a', 'time'), node('g', 'and'), node('c', 'buy')];
    const edges = [edge('a', 'g', 'in-0'), edge('g', 'c')];
    const r = validateGraph(nodes, edges);
    expect(r.errors.some((e) => e.startsWith('missing-input:g'))).toBe(true);
  });

  it('存在环：报 cycle', () => {
    // and 两个输入互连成环（跳过端口合法性，仅测环检测）
    const nodes = [node('g1', 'and'), node('g2', 'and'), node('c', 'buy')];
    const edges = [
      edge('g1', 'g2', 'in-0'),
      edge('g2', 'g1', 'in-0'),
      edge('g1', 'c'),
    ];
    const r = validateGraph(nodes, edges);
    expect(r.errors).toContain('cycle');
  });

  it('孤立指标节点：警告 orphan', () => {
    const nodes = [node('a', 'rsi'), node('b', 'cond'), node('c', 'buy'), node('x', 'macd')];
    const edges = [edge('a', 'b'), edge('b', 'c')];
    const r = validateGraph(nodes, edges);
    expect(r.warnings.some((w) => w.includes('x'))).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});
