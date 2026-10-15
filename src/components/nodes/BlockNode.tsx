import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from '../../store/useStore';
import type { BlockFlowNode, PortType } from '../../types';

const PORT_COLORS: Record<PortType, string> = {
  signal: '#2962ff',
  bool: '#ff9800',
  exec: '#26a69a',
};

export default function BlockNode({ id, data }: NodeProps<BlockFlowNode>) {
  const updateNodeParams = useStore((s) => s.updateNodeParams);
  const removeNode = useStore((s) => s.removeNode);
  const { block, params } = data;

  const setParam = (key: string, raw: string, type: string) => {
    const v = type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw;
    updateNodeParams(id, { [key]: Number.isNaN(v as number) ? 0 : v });
  };

  return (
    <div className="block-node">
      {/* 输入端口（左侧，按类型着色） */}
      {block.inputs.map((t, i) => (
        <Handle
          key={t}
          type="target"
          position={Position.Left}
          id={`in-${i}`}
          style={{
            background: PORT_COLORS[t],
            top: `${((i + 1) / (block.inputs.length + 1)) * 100}%`,
          }}
        />
      ))}

      <div className={`block-header kind-${block.kind}`}>
        <span className="bh-icon">{block.icon}</span>
        <span className="bh-name" title={block.description ?? block.name}>{block.name}</span>
        <button
          className="block-close nodrag"
          title="删除节点"
          onClick={() => removeNode(id)}
        >
          ×
        </button>
      </div>

      {block.params.length === 0 && block.description && (
        <div className="block-desc">{block.description}</div>
      )}

      {block.params.length > 0 && (
        <div className="block-body">
          {block.params.map((p) => (
            <div className="param-row" key={p.key}>
              <label>{p.label}</label>
              {p.type === 'select' ? (
                <select
                  className="nodrag"
                  value={String(params[p.key] ?? p.default)}
                  onChange={(e) => setParam(p.key, e.target.value, p.type)}
                >
                  {p.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="nodrag"
                  type={p.type === 'number' ? 'number' : 'text'}
                  step="any"
                  value={String(params[p.key] ?? p.default)}
                  onChange={(e) => setParam(p.key, e.target.value, p.type)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* 输出端口（右侧） */}
      {block.output && (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          style={{ background: PORT_COLORS[block.output] }}
        />
      )}
    </div>
  );
}
