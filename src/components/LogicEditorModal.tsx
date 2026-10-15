import { useState } from 'react';
import { useStore, uid } from '../store/useStore';
import type { BlockDef, CompareOp, CustomPayload, IndicatorSpec, IRCondition } from '../types';

const OPS: { value: CompareOp; label: string }[] = [
  { value: '<', label: '< 小于' },
  { value: '>', label: '> 大于' },
  { value: '<=', label: '≤ 小于等于' },
  { value: '>=', label: '≥ 大于等于' },
  { value: '==', label: '= 等于' },
  { value: 'crossUp', label: '上穿阈值' },
  { value: 'crossDown', label: '下穿阈值' },
];

/** 表单可选指标（周期可调的用 period 参数） */
const FORM_INDICATORS: { value: string; label: string; hasPeriod: boolean }[] = [
  { value: 'rsi', label: 'RSI', hasPeriod: true },
  { value: 'ema', label: 'EMA 均线', hasPeriod: true },
  { value: 'bb', label: '布林带下轨', hasPeriod: true },
  { value: 'macd', label: 'MACD 主线', hasPeriod: false },
  { value: 'ha', label: 'Heikin Ashi 颜色', hasPeriod: false },
];

function buildIndicator(kind: string, period: number): IndicatorSpec {
  switch (kind) {
    case 'rsi': return { func: 'RSI', params: { period } };
    case 'ema': return { func: 'EMA', params: { period } };
    case 'bb': return { func: 'BB', params: { period, deviation: 2, band: 'lower' } };
    case 'macd': return { func: 'MACD', params: { fast: 12, slow: 26, signal: 9, line: 'main' } };
    case 'ha': return { func: 'HA', params: { color: 'bull' } };
    default: return { func: 'EMA', params: { period } };
  }
}

interface Props {
  onClose: () => void;
}

export default function LogicEditorModal({ onClose }: Props) {
  const addCustomBlock = useStore((s) => s.addCustomBlock);

  const [tab, setTab] = useState<'form' | 'code'>('form');
  const [name, setName] = useState('我的逻辑');
  const [indicator, setIndicator] = useState('rsi');
  const [period, setPeriod] = useState(14);
  const [op, setOp] = useState<CompareOp>('<');
  const [value, setValue] = useState(30);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const hasPeriod = FORM_INDICATORS.find((i) => i.value === indicator)?.hasPeriod ?? false;

  const save = () => {
    if (!name.trim()) {
      setError('请填写逻辑名称');
      return;
    }
    let custom: CustomPayload;
    if (tab === 'form') {
      const condition: IRCondition = {
        type: 'compare',
        indicator: buildIndicator(indicator, period),
        op,
        value: value,
      };
      custom = { mode: 'form', condition };
    } else {
      if (!code.trim()) {
        setError('请输入 MQL 布尔表达式');
        return;
      }
      custom = { mode: 'code', mql: code.trim() };
    }

    const block: BlockDef = {
      id: uid('c_'),
      kind: 'logic',
      name: name.trim(),
      icon: '⚡',
      builtin: false,
      inputs: [],
      output: 'bool',
      params: [],
      custom,
      description: tab === 'form' ? '表单模式自定义逻辑' : '代码模式自定义逻辑',
    };
    addCustomBlock(block);
    onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-editor">
        <div className="modal-head">
          <h3>新增自定义逻辑</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          <button className={`tab ${tab === 'form' ? 'active' : ''}`} onClick={() => setTab('form')}>
            表单模式
          </button>
          <button className={`tab ${tab === 'code' ? 'active' : ''}`} onClick={() => setTab('code')}>
            代码模式
          </button>
        </div>

        <div className="field">
          <label>逻辑名称</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {tab === 'form' ? (
          <>
            <div className="field">
              <label>指标</label>
              <select value={indicator} onChange={(e) => setIndicator(e.target.value)}>
                {FORM_INDICATORS.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>
            {hasPeriod && (
              <div className="field">
                <label>指标周期</label>
                <input type="number" min={1} value={period} onChange={(e) => setPeriod(Number(e.target.value) || 1)} />
              </div>
            )}
            <div className="field-row">
              <div className="field">
                <label>比较</label>
                <select value={op} onChange={(e) => setOp(e.target.value as CompareOp)}>
                  {OPS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>阈值</label>
                <input type="number" step="any" value={value} onChange={(e) => setValue(Number(e.target.value) || 0)} />
              </div>
            </div>
            <div className="block-desc">
              生成块为「输出 bool」的逻辑块，可连接到 And/Or 组合或执行块。指标参数取常用默认值，可拖入画布后用内置指标块替换更精细的条件。
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label>MQL 布尔表达式（MQL4 语法，将按原样嵌入两种平台）</label>
              <textarea
                rows={6}
                placeholder={'例：iRSI(Symbol(), PERIOD_CURRENT, 14, PRICE_CLOSE, 1) < 30'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="block-desc">
              表达式返回 true 时逻辑成立。请避免使用平台特有函数，以便 MQL4/MQL5 双平台生成。
            </div>
          </>
        )}

        {error && <div className="msg-list errors">{error}</div>}

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" style={{ width: 'auto', padding: '6px 18px' }} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
