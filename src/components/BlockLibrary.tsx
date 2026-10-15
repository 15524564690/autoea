import { useState } from 'react';
import { useStore } from '../store/useStore';
import { BUILTIN_BLOCKS } from '../data/builtinBlocks';
import type { BlockDef, BlockKind } from '../types';

const DND_MIME = 'application/autoea-block';

const GROUPS: { kind: BlockKind; title: string }[] = [
  { kind: 'indicator', title: '指标' },
  { kind: 'logic', title: '逻辑' },
  { kind: 'execution', title: '执行' },
  { kind: 'template', title: '策略模板' },
];

interface Props {
  onAddLogic: () => void;
}

export default function BlockLibrary({ onAddLogic }: Props) {
  const customBlocks = useStore((s) => s.customBlocks);
  const deleteCustomBlock = useStore((s) => s.deleteCustomBlock);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const match = (b: BlockDef) => !q || b.name.toLowerCase().includes(q);

  const renderGroup = (title: string, blocks: BlockDef[], deletable = false) => {
    const visible = blocks.filter(match);
    if (visible.length === 0 && !deletable) return null;
    return (
      <div key={title}>
        <div className="lib-group-title">
          <span>{title}</span>
          {title === '逻辑' && (
            <button className="btn btn-sm btn-add-logic" onClick={onAddLogic}>
              ＋ 新增逻辑
            </button>
          )}
        </div>
        {deletable && visible.length === 0 && <div className="empty-hint">暂无自定义逻辑</div>}
        {visible.map((b) => (
          <div
            key={b.id}
            className="lib-item"
            title={b.description ?? b.name}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_MIME, b.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="li-icon">{b.icon}</span>
            <span className="li-name">{b.name}</span>
            {deletable && (
              <button
                className="li-del"
                title="删除该自定义块"
                onClick={() => {
                  if (window.confirm(`删除自定义逻辑「${b.name}」？画布上引用它的节点也会被移除。`)) {
                    deleteCustomBlock(b.id);
                  }
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <h2>策略块</h2>

      <div className="lib-search">
        <div className="field">
          <input
            type="text"
            placeholder="搜索策略块…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {GROUPS.map((g) => renderGroup(g.title, BUILTIN_BLOCKS.filter((b) => b.kind === g.kind)))}
      {renderGroup('我的自定义', customBlocks, true)}
    </div>
  );
}
