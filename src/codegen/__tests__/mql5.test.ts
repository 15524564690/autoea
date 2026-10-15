import { describe, expect, it } from 'vitest';
import { renderMQL5 } from '../mql5';
import type { EAConfig, StrategyIR } from '../../types';

const cfg: EAConfig = {
  name: 'DemoEA',
  symbol: 'EURUSD',
  timeframe: 'M15',
  lotSize: 0.01,
  sl: 50,
  tp: 100,
};

describe('renderMQL5', () => {
  it('RSI 句柄在 OnInit 创建，OnTick 用 CopyBuffer 取值，买入用 CTrade', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: { type: 'compare', indicator: { func: 'RSI', params: { period: 14 } }, op: '<', value: 30 },
          actions: [{ type: 'buy', lot: 0.01, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
      ],
      indicators: [{ func: 'RSI', params: { period: 14 } }],
    };
    const code = renderMQL5(cfg, ir);

    expect(code).toContain('rsiHandle = iRSI(_Symbol, PERIOD_CURRENT, 14, PRICE_CLOSE)');
    expect(code).toContain('CopyBuffer(rsiHandle, 0, 1, 1, buf)');
    expect(code).toContain('rsi_1 < 30');
    expect(code).toContain('CTrade trade;');
    expect(code).toContain('trade.Buy(');
    expect(code).toContain('int OnInit()');
    expect(code).toContain('void OnTick()');
    expect(code).toContain('void OnDeinit(');
    // 文档要求：OnDeinit 释放指标句柄
    expect(code).toContain('IndicatorRelease(rsiHandle)');
  });

  it('BB 指标：iBands 参数顺序为 period,bands_shift(0),deviation,price（MQL5 与 MQL4 相反）', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: { type: 'compare', indicator: { func: 'BB', params: { period: 20, deviation: 2, band: 'lower' } }, op: '<', value: 1 },
          actions: [{ type: 'buy', lot: 0.01, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
      ],
      indicators: [{ func: 'BB', params: { period: 20, deviation: 2, band: 'lower' } }],
    };
    const code = renderMQL5(cfg, ir);

    expect(code).toContain('iBands(_Symbol, PERIOD_CURRENT, 20, 0, 2, PRICE_CLOSE)');
    // 下轨缓冲区编号 2（0=中轨 1=上轨 2=下轨）
    expect(code).toContain('CopyBuffer(bbHandle, 2, 1, 1, buf)');
    expect(code).toContain('IndicatorRelease(bbHandle)');
  });

  it('同参数 BB 的不同轨（或 MACD 不同线）共享一个指标句柄', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: { type: 'compare', indicator: { func: 'BB', params: { period: 20, deviation: 2, band: 'lower' } }, op: '<', value: 1 },
          actions: [{ type: 'buy', lot: 0.01, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
        {
          when: { type: 'compare', indicator: { func: 'BB', params: { period: 20, deviation: 2, band: 'upper' } }, op: '>', value: 1 },
          actions: [{ type: 'closeBuy', lot: 0, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
      ],
      indicators: [
        { func: 'BB', params: { period: 20, deviation: 2, band: 'lower' } },
        { func: 'BB', params: { period: 20, deviation: 2, band: 'upper' } },
      ],
    };
    const code = renderMQL5(cfg, ir);

    // 只创建/声明/释放一个句柄
    expect(code.match(/iBands\(_Symbol/g)).toHaveLength(1);
    expect(code.match(/int bb\w*Handle = INVALID_HANDLE/g)).toHaveLength(1);
    expect(code.match(/IndicatorRelease\(bb\w*Handle\)/g)).toHaveLength(1);
    // 两个缓冲区变量分别从 buffer 2 / buffer 1 取值
    expect(code).toContain('CopyBuffer(bbHandle, 2, 1, 1, buf)');
    expect(code).toContain('CopyBuffer(bbHandle, 1, 1, 1, buf)');
  });

  it('马丁/网格参数：生成加仓逻辑', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: null,
          actions: [{ type: 'buy', lot: 0.01, sl: 0, tp: 0, multiplier: 2, gridStep: 200, maxLayers: 5 }],
        },
      ],
      indicators: [],
    };
    const code = renderMQL5(cfg, ir);

    expect(code).toContain('CountOrders(POSITION_TYPE_BUY)');
    expect(code).toContain('layers < 5');
    expect(code).toContain('LastOpenPrice(POSITION_TYPE_BUY) - SymbolInfoDouble(_Symbol, SYMBOL_ASK) >= 200 * _Point');
    expect(code).toContain('LastOrderLot(POSITION_TYPE_BUY) * 2');
  });

  it('HA 指标：生成 CopyRates 版 HA_Color helper', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: { type: 'compare', indicator: { func: 'HA', params: { color: 'bull' } }, op: '>', value: 0 },
          actions: [{ type: 'buy', lot: 0.01, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
      ],
      indicators: [{ func: 'HA', params: { color: 'bull' } }],
    };
    const code = renderMQL5(cfg, ir);

    expect(code).toContain('double HA_Color(int shift)');
    expect(code).toContain('CopyRates(_Symbol, PERIOD_CURRENT, shift, 2, rates)');
    expect(code).toContain('HA_Color(1) > 0');
  });

  it('时间过滤：MQL5 用 MqlDateTime（MinutesOfDay helper）', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: { type: 'time', from: '08:00', to: '22:00' },
          actions: [{ type: 'closeAll', lot: 0, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
      ],
      indicators: [],
    };
    const code = renderMQL5(cfg, ir);

    expect(code).toContain('TimeToStruct(TimeCurrent(), dt)');
    expect(code).toContain('MinutesOfDay() >= 480');
    expect(code).toContain('MinutesOfDay() <= 1320');
    expect(code).toContain('trade.PositionClose(');
  });

  it('MACD 主线取 buffer 0；EMA 句柄', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: {
            type: 'and',
            left: { type: 'compare', indicator: { func: 'MACD', params: { fast: 12, slow: 26, signal: 9, line: 'main' } }, op: '>', value: 0 },
            right: { type: 'compare', indicator: { func: 'EMA', params: { period: 20 } }, op: '>', value: 5 },
          },
          actions: [{ type: 'sell', lot: 0.02, sl: 30, tp: 60, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
      ],
      indicators: [
        { func: 'MACD', params: { fast: 12, slow: 26, signal: 9, line: 'main' } },
        { func: 'EMA', params: { period: 20 } },
      ],
    };
    const code = renderMQL5(cfg, ir);

    expect(code).toContain('macdHandle = iMACD(_Symbol, PERIOD_CURRENT, 12, 26, 9, PRICE_CLOSE)');
    expect(code).toContain('CopyBuffer(macdHandle, 0, 1, 1, buf)');
    expect(code).toContain('emaHandle = iMA(_Symbol, PERIOD_CURRENT, 20, 0, MODE_EMA, PRICE_CLOSE)');
    expect(code).toContain('trade.Sell(');
    expect(code).toContain('OpenSell(0.02, 30, 60)');
  });
});
