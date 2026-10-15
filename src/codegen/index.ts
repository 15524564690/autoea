import type { BlockFlowNode, CanvasEdge, CodegenResult, EAConfig } from '../types';
import { validateGraph } from './validate';
import { toIR } from './toIR';
import { renderMQL4 } from './mql4';
import { renderMQL5 } from './mql5';

export { validateGraph, toIR, renderMQL4, renderMQL5 };
export { expandTemplate } from './templateExpand';

/**
 * 代码生成总入口：校验 → 编译 IR → 双平台渲染。
 * 自定义逻辑块（form/code 模式）由 toIR 直接从节点携带的 block.custom 读取。
 * 有错误时不生成代码（返回 undefined），由 UI 禁用下载。
 */
export function generateCode(
  config: EAConfig,
  nodes: BlockFlowNode[],
  edges: CanvasEdge[]
): CodegenResult {
  const { errors, warnings } = validateGraph(nodes, edges);
  if (errors.length > 0) return { errors, warnings };

  const ir = toIR(nodes, edges);
  return {
    mql4: renderMQL4(config, ir),
    mql5: renderMQL5(config, ir),
    errors,
    warnings,
  };
}
