import { useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  BackgroundVariant,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore, findBlock } from '../store/useStore';
import { expandTemplate } from '../codegen';
import BlockNode from './nodes/BlockNode';
import type { BlockFlowNode } from '../types';

const nodeTypes = { block: BlockNode };
const DND_MIME = 'application/autoea-block';

function Canvas() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const eaConfig = useStore((s) => s.eaConfig);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const addBlock = useStore((s) => s.addBlock);
  const addTemplateNodes = useStore((s) => s.addTemplateNodes);
  const clearCanvas = useStore((s) => s.clearCanvas);
  const saveStrategy = useStore((s) => s.saveStrategy);

  const { screenToFlowPosition } = useReactFlow();

  // —— 未保存标记：与最近一次「保存策略」快照比较 ——
  const sig = useMemo(
    () => JSON.stringify({ c: eaConfig, n: nodes, e: edges }),
    [eaConfig, nodes, edges]
  );
  const [savedSig, setSavedSig] = useState<string>(() => sig);
  const dirty = sig !== savedSig;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData(DND_MIME);
    if (!blockId) return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

    if (blockId.startsWith('tpl_')) {
      // 模板块：展开为预连线子图
      const { nodes: tNodes, edges: tEdges } = expandTemplate(blockId, pos);
      addTemplateNodes(tNodes, tEdges);
      return;
    }
    const block = findBlock(blockId);
    if (block) addBlock(block, pos);
  };

  const handleSave = () => {
    const name = window.prompt('保存策略名称：', eaConfig.name);
    if (name === null) return; // 取消
    saveStrategy(name);
    setSavedSig(JSON.stringify({ c: eaConfig, n: nodes, e: edges }));
  };

  const handleNodesChange = (changes: NodeChange<BlockFlowNode>[]) => onNodesChange(changes);
  const handleEdgesChange = (changes: EdgeChange[]) => onEdgesChange(changes);
  const handleConnect = (c: Connection) => onConnect(c);

  return (
    <>
      <div className="canvas-toolbar">
        <span className="title">策略画布</span>
        {dirty && <span className="dirty-dot" title="有未保存的修改" />}
        <span className="toolbar-spacer" />
        <button className="btn btn-sm" onClick={handleSave}>💾 保存策略</button>
        <button
          className="btn btn-sm btn-danger"
          onClick={() => {
            if (nodes.length > 0 && window.confirm('清空画布上的全部节点？')) clearCanvas();
          }}
        >
          🗑 清空
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        deleteKeyCode={['Delete', 'Backspace']}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#2a2e39" />
        <Controls />
        <MiniMap pannable zoomable bgColor="#1a1e29" maskColor="rgba(19, 23, 34, 0.7)" />
      </ReactFlow>
    </>
  );
}

export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
