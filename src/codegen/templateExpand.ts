import type { BlockFlowNode, CanvasEdge } from '../types';
import { getBuiltinBlock } from '../data/builtinBlocks';

/**
 * 模板块 → 画布子图（节点 + 预连线）。
 * 节点 id 独立生成（nanoid 风格），位置相对 origin 偏移。
 */

let seq = 0;
const uid = (prefix: string): string =>
  `${prefix}t${Date.now().toString(36)}_${(seq++).toString(36)}`;

type XY = { x: number; y: number };

function makeNode(
  blockId: string,
  dx: number,
  dy: number,
  origin: XY,
  paramOverride: Record<string, string | number> = {}
): BlockFlowNode {
  const block = getBuiltinBlock(blockId)!;
  const params = {
    ...Object.fromEntries(block.params.map((p) => [p.key, p.default])),
    ...paramOverride,
  };
  return {
    id: uid('n_'),
    type: 'block',
    position: { x: origin.x + dx, y: origin.y + dy },
    data: { block, params },
  };
}

function link(source: BlockFlowNode, target: BlockFlowNode, targetHandle = 'in-0'): CanvasEdge {
  return { id: uid('e_'), source: source.id, sourceHandle: 'out', target: target.id, targetHandle };
}

export function expandTemplate(
  templateId: string,
  origin: XY
): { nodes: BlockFlowNode[]; edges: CanvasEdge[] } {
  switch (templateId) {
    // 马丁格尔：RSI 超卖买入，亏损加倍数摊平
    case 'tpl_martin': {
      const rsi = makeNode('rsi', 0, 0, origin);
      const cond = makeNode('cond', 0, 110, origin, { op: '<', value: 30 });
      const buy = makeNode('buy', 0, 220, origin, { multiplier: 2, gridStep: 200, maxLayers: 5 });
      return { nodes: [rsi, cond, buy], edges: [link(rsi, cond), link(cond, buy)] };
    }

    // 网格：时间过滤作为常真触发（00:00–23:59，用户可改为交易时段），固定间距等量加仓
    case 'tpl_grid': {
      const time = makeNode('time', 0, 0, origin, { from: '00:00', to: '23:59' });
      const buy = makeNode('buy', 0, 110, origin, { multiplier: 1, gridStep: 300, maxLayers: 10 });
      return { nodes: [time, buy], edges: [link(time, buy)] };
    }

    // 趋势跟踪：MACD 主线上穿 0 轴做多 / 下穿做空
    // （MACD = EMA快 − EMA慢，主线上穿 0 即 EMA 快线上穿慢线）
    case 'tpl_trend': {
      const macd = makeNode('macd', 0, 0, origin);
      const condUp = makeNode('cond', 0, 110, origin, { op: 'crossUp', value: 0 });
      const condDown = makeNode('cond', 280, 110, origin, { op: 'crossDown', value: 0 });
      const buy = makeNode('buy', 0, 220, origin);
      const sell = makeNode('sell', 280, 220, origin);
      return {
        nodes: [macd, condUp, condDown, buy, sell],
        edges: [link(macd, condUp), link(macd, condDown), link(condUp, buy), link(condDown, sell)],
      };
    }

    default:
      return { nodes: [], edges: [] };
  }
}
