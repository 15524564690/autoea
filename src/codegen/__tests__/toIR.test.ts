import { describe, expect, it } from 'vitest';
import { toIR } from '../toIR';
import type { BlockDef, BlockFlowNode, CanvasEdge } from '../../types';
import { getBuiltinBlock } from '../../data/builtinBlocks';

function node(id: string, blockId: string, paramOverride: Record<string, string | number> = {}): BlockFlowNode {
  const block = getBuiltinBlock(blockId)!;
  const params = { ...Object.fromEntries(block.params.map((p) => [p.key, p.default])), ...paramOverride };
  return { id, type: 'block', position: { x: 0, y: 0 }, data: { block, params } };
}

function customNode(id: string, block: BlockDef): BlockFlowNode {
  return { id, type: 'block', position: { x: 0, y: 0 }, data: { block, params: {} } };
}

function edge(source: string, target: string, targetHandle = 'in-0'): CanvasEdge {
  return { id: `e_${source}_${target}_${targetHandle}`, source, target, sourceHandle: 'out', targetHandle };
}

describe('toIR', () => {
  it('RSI→条件(<30)→买入 编译为单个分支', () => {
    const nodes = [node('a', 'rsi'), node('b', 'cond'), node('c', 'buy')];
    const edges = [edge('a', 'b'), edge('b', 'c')];
    const ir = toIR(nodes, edges);

    expect(ir.branches).toHaveLength(1);
    const br = ir.branches[0];
    expect(br.when).toEqual({
      type: 'compare',
      indicator: { func: 'RSI', params: { period: 14 } },
      op: '<',
      value: 30,
    });
    expect(br.actions).toEqual([
      { type: 'buy', lot: 0.01, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 },
    ]);
    expect(ir.indicators).toEqual([{ func: 'RSI', params: { period: 14 } }]);
  });

  it('And 组合两个条件', () => {
    const nodes = [node('a', 'rsi'), node('b', 'cond'), node('t', 'time'), node('g', 'and'), node('c', 'buy')];
    const edges = [
      edge('a', 'b'),
      edge('b', 'g', 'in-0'),
      edge('t', 'g', 'in-1'),
      edge('g', 'c'),
    ];
    const ir = toIR(nodes, edges);
    const when = ir.branches[0].when!;
    expect(when.type).toBe('and');
    if (when.type === 'and') {
      expect(when.left.type).toBe('compare');
      expect(when.right.type).toBe('time');
      if (when.right.type === 'time') {
        expect(when.right.from).toBe('08:00');
        expect(when.right.to).toBe('22:00');
      }
    }
  });

  it('两个执行块 → 两个分支；指标去重', () => {
    // 两个独立 RSI 节点参数相同 → indicators 只保留一份
    const nodes = [
      node('a1', 'rsi'), node('b1', 'cond', { op: '<', value: 30 }),
      node('a2', 'rsi'), node('b2', 'cond', { op: '>', value: 70 }),
      node('c1', 'buy'), node('c2', 'sell'),
    ];
    const edges = [
      edge('a1', 'b1'), edge('b1', 'c1'),
      edge('a2', 'b2'), edge('b2', 'c2'),
    ];
    const ir = toIR(nodes, edges);
    expect(ir.branches).toHaveLength(2);
    expect(ir.indicators).toHaveLength(1);
    expect(ir.branches[1].actions[0].type).toBe('sell');
  });

  it('代码模式自定义逻辑块 → custom 条件', () => {
    const custBlock: BlockDef = {
      id: 'cust1', kind: 'logic', name: '我的逻辑', icon: '⚡', builtin: false,
      inputs: [], output: 'bool', params: [],
      custom: { mode: 'code', mql: 'MyCustomCond()' },
    };
    const nodes = [
      node('c', 'buy'),
      customNode('k', custBlock),
    ];
    const edges = [edge('k', 'c')];
    const ir = toIR(nodes, edges);
    expect(ir.branches[0].when).toEqual({ type: 'custom', code: 'MyCustomCond()' });
  });

  it('无条件的执行块（直接挂到画布）→ when 为 null', () => {
    const nodes = [node('c', 'closeAll')];
    const ir = toIR(nodes, []);
    expect(ir.branches).toEqual([
      { when: null, actions: [{ type: 'closeAll', lot: 0, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 }] },
    ]);
  });
});
