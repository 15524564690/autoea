import { describe, expect, it } from 'vitest';
import { expandTemplate } from '../templateExpand';
import { validateGraph } from '../validate';
import { toIR } from '../toIR';

describe('expandTemplate', () => {
  it('马丁模板：RSI→条件→买入 预连线，买入带马丁参数', () => {
    const { nodes, edges } = expandTemplate('tpl_martin', { x: 100, y: 200 });

    expect(nodes).toHaveLength(3);
    const kinds = nodes.map((n) => n.data.block.id);
    expect(kinds).toEqual(['rsi', 'cond', 'buy']);

    const buy = nodes[2];
    expect(buy.data.params.multiplier).toBe(2);
    expect(buy.data.params.gridStep).toBe(200);
    expect(buy.data.params.maxLayers).toBe(5);
    expect(buy.data.params.lot).toBe(0.01);

    // 预连线：rsi→cond(in-0)、cond→buy(in-0)，位置相对 origin 偏移
    expect(edges).toHaveLength(2);
    expect(edges[0].source).toBe(nodes[0].id);
    expect(edges[0].target).toBe(nodes[1].id);
    expect(edges[1].target).toBe(nodes[2].id);
    expect(nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(nodes[2].position.y).toBeGreaterThan(nodes[0].position.y);

    // 展开结果可直接通过校验
    expect(validateGraph(nodes, edges).errors).toHaveLength(0);
  });

  it('网格模板：时间过滤+买入，间距 300 点、最多 10 层、倍数 1', () => {
    const { nodes, edges } = expandTemplate('tpl_grid', { x: 0, y: 0 });

    expect(nodes).toHaveLength(2);
    const time = nodes.find((n) => n.data.block.id === 'time')!;
    const buy = nodes.find((n) => n.data.block.id === 'buy')!;
    expect(time.data.params.from).toBe('00:00');
    expect(time.data.params.to).toBe('23:59');
    expect(buy.data.params.multiplier).toBe(1);
    expect(buy.data.params.gridStep).toBe(300);
    expect(buy.data.params.maxLayers).toBe(10);
    expect(edges).toHaveLength(1);

    expect(validateGraph(nodes, edges).errors).toHaveLength(0);
  });

  it('趋势模板：MACD 上穿 0 买入 / 下穿 0 卖出（EMA 快慢交叉）', () => {
    const { nodes, edges } = expandTemplate('tpl_trend', { x: 0, y: 0 });

    expect(nodes).toHaveLength(5);
    const conds = nodes.filter((n) => n.data.block.id === 'cond');
    expect(conds).toHaveLength(2);
    expect(conds.map((c) => c.data.params.op).sort()).toEqual(['crossDown', 'crossUp']);
    expect(conds.every((c) => Number(c.data.params.value) === 0)).toBe(true);

    const buy = nodes.find((n) => n.data.block.id === 'buy')!;
    const sell = nodes.find((n) => n.data.block.id === 'sell')!;
    expect(buy && sell).toBeTruthy();

    // 两条 MACD→条件 连线 + 两条 条件→执行 连线
    expect(edges).toHaveLength(4);

    expect(validateGraph(nodes, edges).errors).toHaveLength(0);

    // 可编译为 IR：两个分支
    const ir = toIR(nodes, edges);
    expect(ir.branches).toHaveLength(2);
  });

  it('未知模板：返回空图', () => {
    const { nodes, edges } = expandTemplate('nope', { x: 0, y: 0 });
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});
