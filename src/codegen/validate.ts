import type { BlockFlowNode, CanvasEdge } from '../types';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/**
 * 策略图校验：
 * - errors: no-execution / missing-input:<nodeId>[:<port>] / cycle
 * - warnings: orphan:<nodeId>（与执行块无路径连通的节点）
 */
export function validateGraph(nodes: BlockFlowNode[], edges: CanvasEdge[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. 至少一个执行块
  const execNodes = nodes.filter((n) => n.data.block.kind === 'execution');
  if (execNodes.length === 0) {
    return { errors: ['no-execution'], warnings };
  }

  // 2. 执行/逻辑块的每个输入口必须被连接
  for (const n of nodes) {
    const inputs = n.data.block.inputs;
    if (inputs.length === 0) continue;
    inputs.forEach((_, i) => {
      const connected = edges.some(
        (e) => e.target === n.id && (e.targetHandle ?? 'in-0') === `in-${i}`
      );
      if (!connected) errors.push(`missing-input:${n.id}:in-${i}`);
    });
  }

  // 3. 环检测（DFS 三色标记，图无向于端口类型）
  if (hasCycle(nodes, edges)) errors.push('cycle');

  // 4. 孤立节点：从执行块沿边反向可达之外的非执行节点
  const reachable = new Set<string>();
  const stack = execNodes.map((n) => n.id);
  while (stack.length) {
    const cur = stack.pop()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const e of edges) {
      if (e.target === cur) stack.push(e.source);
    }
  }
  for (const n of nodes) {
    if (!reachable.has(n.id)) warnings.push(`orphan:${n.id}`);
  }

  return { errors, warnings };
}

function hasCycle(nodes: BlockFlowNode[], edges: CanvasEdge[]): boolean {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  nodes.forEach((n) => color.set(n.id, WHITE));

  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  const visit = (id: string): boolean => {
    color.set(id, GRAY);
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && visit(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  return nodes.some((n) => color.get(n.id) === WHITE && visit(n.id));
}
