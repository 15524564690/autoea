import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import type {
  BlockDef,
  BlockFlowNode,
  CanvasEdge,
  EAConfig,
  SavedStrategy,
} from '../types';
import { getBuiltinBlock } from '../data/builtinBlocks';

// —— localStorage 安全读写（隐私模式/超配额降级为内存） ——

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    console.warn(`[autoEA] localStorage 读取失败: ${key}，使用默认值`);
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.warn(`[autoEA] localStorage 写入失败: ${key}（可能处于隐私模式或超配额），仅保留在内存中`);
  }
}

const K_CUSTOM = 'autoea.custom_blocks';
const K_STRATEGIES = 'autoea.strategies';
const K_DRAFT = 'autoea.last_draft';

let seq = 0;
export const uid = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}_${(seq++).toString(36)}`;

export const defaultParams = (block: BlockDef): Record<string, string | number> =>
  Object.fromEntries(block.params.map((p) => [p.key, p.default]));

interface AutoEAState {
  eaConfig: EAConfig;
  nodes: BlockFlowNode[];
  edges: CanvasEdge[];
  customBlocks: BlockDef[];
  savedStrategies: SavedStrategy[];

  setConfig: (patch: Partial<EAConfig>) => void;
  addBlock: (block: BlockDef, position: { x: number; y: number }) => void;
  addTemplateNodes: (nodes: BlockFlowNode[], edges: CanvasEdge[]) => void;
  updateNodeParams: (nodeId: string, params: Record<string, string | number>) => void;
  onNodesChange: (changes: NodeChange<BlockFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** 带端口类型 + 占用校验的连线；不合法则拒绝 */
  onConnect: (connection: Connection) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  clearCanvas: () => void;

  addCustomBlock: (block: BlockDef) => void;
  deleteCustomBlock: (blockId: string) => void;

  saveStrategy: (name: string) => void;
  loadStrategy: (id: string) => void;
  deleteStrategy: (id: string) => void;
}

const initialDraft = safeGet<{ eaConfig?: EAConfig; nodes?: BlockFlowNode[]; edges?: CanvasEdge[] }>(
  K_DRAFT,
  {}
);

export const useStore = create<AutoEAState>()((set, get) => ({
  eaConfig: initialDraft.eaConfig ?? {
    name: 'MyStrategy_v1',
    symbol: 'EURUSD',
    timeframe: 'M15',
    lotSize: 0.01,
    sl: 50,
    tp: 100,
  },
  nodes: initialDraft.nodes ?? [],
  edges: initialDraft.edges ?? [],
  customBlocks: safeGet<BlockDef[]>(K_CUSTOM, []),
  savedStrategies: safeGet<SavedStrategy[]>(K_STRATEGIES, []),

  setConfig: (patch) => {
    set((s) => ({ eaConfig: { ...s.eaConfig, ...patch } }));
    saveDraft(get());
  },

  addBlock: (block, position) => {
    const node: BlockFlowNode = {
      id: uid('n_'),
      type: 'block',
      position,
      data: { block, params: defaultParams(block) },
    };
    set((s) => ({ nodes: [...s.nodes, node] }));
    saveDraft(get());
  },

  addTemplateNodes: (nodes, edges) => {
    set((s) => ({ nodes: [...s.nodes, ...nodes], edges: [...s.edges, ...edges] }));
    saveDraft(get());
  },

  updateNodeParams: (nodeId, params) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, ...params } } } : n
      ),
    }));
    saveDraft(get());
  },

  onNodesChange: (changes) => {
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }));
    if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')) saveDraft(get());
  },

  onEdgesChange: (changes) => {
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges as never) as CanvasEdge[] }));
    if (changes.some((c) => c.type !== 'select')) saveDraft(get());
  },

  onConnect: (connection) => {
    const { nodes, edges } = get();
    const src = nodes.find((n) => n.id === connection.source);
    const tgt = nodes.find((n) => n.id === connection.target);
    if (!src || !tgt || src.id === tgt.id) return;

    // 源端口：统一一个输出（handle id = 'out'）
    const outType = src.data.block.output;
    if (!outType) return;

    // 目标端口：handle id 形如 in-0 / in-1
    const idx = Number((connection.targetHandle ?? 'in-0').slice(3)) || 0;
    const inType = tgt.data.block.inputs[idx];
    if (!inType || inType !== outType) return; // 类型不匹配，拒绝吸附

    // 目标端口占用检查（每个输入口只允许一条连线）
    const occupied = edges.some(
      (e) => e.target === tgt.id && (e.targetHandle ?? 'in-0') === (connection.targetHandle ?? 'in-0')
    );
    if (occupied) return;

    set((s) => ({
      edges: addEdge(
        { ...connection, id: uid('e_') } as CanvasEdge,
        s.edges as never
      ) as CanvasEdge[],
    }));
    saveDraft(get());
  },

  removeNode: (nodeId) => {
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
    saveDraft(get());
  },

  removeEdge: (edgeId) => {
    set((s) => ({ edges: s.edges.filter((e) => e.id !== edgeId) }));
    saveDraft(get());
  },

  clearCanvas: () => {
    set({ nodes: [], edges: [] });
    saveDraft(get());
  },

  addCustomBlock: (block) => {
    set((s) => {
      const next = [...s.customBlocks, block];
      safeSet(K_CUSTOM, next);
      return { customBlocks: next };
    });
  },

  deleteCustomBlock: (blockId) => {
    set((s) => {
      const next = s.customBlocks.filter((b) => b.id !== blockId);
      safeSet(K_CUSTOM, next);
      // 同步移除画布上引用该块的节点（保留其连线结构中其他节点）
      const nodeIds = new Set(s.nodes.filter((n) => n.data.block.id === blockId).map((n) => n.id));
      return {
        customBlocks: next,
        nodes: s.nodes.filter((n) => !nodeIds.has(n.id)),
        edges: s.edges.filter((e) => !nodeIds.has(e.source) && !nodeIds.has(e.target)),
      };
    });
    saveDraft(get());
  },

  saveStrategy: (name) => {
    const { eaConfig, nodes, edges, savedStrategies } = get();
    const strategy: SavedStrategy = {
      id: uid('s_'),
      name: name || eaConfig.name,
      savedAt: Date.now(),
      eaConfig: { ...eaConfig },
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    const next = [strategy, ...savedStrategies];
    safeSet(K_STRATEGIES, next);
    set({ savedStrategies: next });
  },

  loadStrategy: (id) => {
    const s = get().savedStrategies.find((x) => x.id === id);
    if (!s) return;
    const restored: Pick<AutoEAState, 'eaConfig' | 'nodes' | 'edges'> = {
      eaConfig: { ...s.eaConfig },
      nodes: JSON.parse(JSON.stringify(s.nodes)),
      edges: JSON.parse(JSON.stringify(s.edges)),
    };
    set(restored);
    saveDraft(get());
  },

  deleteStrategy: (id) => {
    set((s) => {
      const next = s.savedStrategies.filter((x) => x.id !== id);
      safeSet(K_STRATEGIES, next);
      return { savedStrategies: next };
    });
  },
}));

function saveDraft(s: AutoEAState): void {
  safeSet(K_DRAFT, {
    eaConfig: s.eaConfig,
    nodes: s.nodes,
    edges: s.edges,
  });
}

/** 按 id 查找块定义（内置 + 自定义） */
export const findBlock = (id: string): BlockDef | undefined =>
  getBuiltinBlock(id) ?? useStore.getState().customBlocks.find((b) => b.id === id);
