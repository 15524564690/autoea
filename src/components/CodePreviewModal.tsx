import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { generateCode } from '../codegen';

interface Props {
  onClose: () => void;
}

export default function CodePreviewModal({ onClose }: Props) {
  const eaConfig = useStore((s) => s.eaConfig);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);

  const result = useMemo(() => generateCode(eaConfig, nodes, edges), [eaConfig, nodes, edges]);
  const [tab, setTab] = useState<'mql4' | 'mql5'>('mql4');
  const [copied, setCopied] = useState(false);

  const code = tab === 'mql4' ? result.mql4 : result.mql5;
  const ext = tab === 'mql4' ? 'mq4' : 'mq5';
  const hasErrors = result.errors.length > 0;

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.alert('复制失败，请手动选择代码复制');
    }
  };

  const download = () => {
    if (!code) return;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${eaConfig.name || 'MyEA'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>EA 代码 — {eaConfig.name}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {hasErrors && (
          <div className="msg-list errors">
            策略图存在错误，无法生成代码：
            <ul>
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {result.warnings.length > 0 && (
          <div className="msg-list warnings">
            警告（不影响生成）：
            <ul>
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="modal-tabs">
          <button className={`tab ${tab === 'mql4' ? 'active' : ''}`} onClick={() => setTab('mql4')}>
            MQL4 (MT4)
          </button>
          <button className={`tab ${tab === 'mql5' ? 'active' : ''}`} onClick={() => setTab('mql5')}>
            MQL5 (MT5)
          </button>
        </div>

        {code ? (
          <pre className="code-view">{code}</pre>
        ) : (
          <div className="empty-hint">{hasErrors ? '修正错误后可生成代码' : '暂无代码'}</div>
        )}

        <div className="modal-foot">
          <button className="btn" onClick={copy} disabled={hasErrors}>
            {copied ? '✓ 已复制' : '复制'}
          </button>
          <button className="btn btn-primary" style={{ width: 'auto', padding: '6px 18px' }} onClick={download} disabled={hasErrors}>
            ⬇ 下载 .{ext}
          </button>
        </div>
      </div>
    </div>
  );
}
