import { useStore } from '../store/useStore';
import type { EAConfig } from '../types';

const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'XAUUSD', 'BTCUSD'];
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

interface Props {
  onGenerate: () => void;
}

export default function EAConfigPanel({ onGenerate }: Props) {
  const eaConfig = useStore((s) => s.eaConfig);
  const setConfig = useStore((s) => s.setConfig);
  const savedStrategies = useStore((s) => s.savedStrategies);
  const loadStrategy = useStore((s) => s.loadStrategy);
  const deleteStrategy = useStore((s) => s.deleteStrategy);

  const set = (patch: Partial<EAConfig>) => setConfig(patch);

  return (
    <div>
      <h2>EA 配置</h2>

      <div className="field">
        <label>策略名称</label>
        <input type="text" value={eaConfig.name} onChange={(e) => set({ name: e.target.value })} />
      </div>

      <div className="field">
        <label>品种</label>
        <select value={eaConfig.symbol} onChange={(e) => set({ symbol: e.target.value })}>
          {SYMBOLS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>周期</label>
        <select value={eaConfig.timeframe} onChange={(e) => set({ timeframe: e.target.value })}>
          {TIMEFRAMES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <div className="field">
          <label>手数</label>
          <input
            type="number" step={0.01} min={0.01} value={eaConfig.lotSize}
            onChange={(e) => set({ lotSize: Number(e.target.value) || 0.01 })}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>止损(点)</label>
          <input
            type="number" min={0} value={eaConfig.sl}
            onChange={(e) => set({ sl: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="field">
          <label>止盈(点)</label>
          <input
            type="number" min={0} value={eaConfig.tp}
            onChange={(e) => set({ tp: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={onGenerate}>
        ▶ 生成 EA 代码
      </button>

      <div className="strategy-list">
        <h2>已保存策略</h2>
        {savedStrategies.length === 0 && <div className="empty-hint">暂无保存的策略</div>}
        {savedStrategies.map((s) => (
          <div key={s.id} className="strategy-item">
            <div className="s-name" title={s.name}>
              {s.name}
              <div className="s-time">{new Date(s.savedAt).toLocaleString()}</div>
            </div>
            <button className="btn btn-sm" onClick={() => loadStrategy(s.id)}>加载</button>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => {
                if (window.confirm(`删除策略「${s.name}」？`)) deleteStrategy(s.id);
              }}
            >
              删
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
