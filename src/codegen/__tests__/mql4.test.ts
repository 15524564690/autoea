import { describe, expect, it } from 'vitest';
import { renderMQL4 } from '../mql4';
import type { EAConfig, StrategyIR } from '../../types';

const cfg: EAConfig = {
  name: 'DemoEA',
  symbol: 'EURUSD',
  timeframe: 'M15',
  lotSize: 0.01,
  sl: 50,
  tp: 100,
};

describe('renderMQL4', () => {
  it('RSI<30 + 买入：生成 iRSI 表达式与 OrderSend(OP_BUY)，含 EA 骨架', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: { type: 'compare', indicator: { func: 'RSI', params: { period: 14 } }, op: '<', value: 30 },
          actions: [{ type: 'buy', lot: 0.01, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
      ],
      indicators: [{ func: 'RSI', params: { period: 14 } }],
    };
    const code = renderMQL4(cfg, ir);

    expect(code).toContain('iRSI(Symbol(), PERIOD_CURRENT, 14, PRICE_CLOSE, 1) < 30');
    expect(code).toContain('OrderSend(Symbol(), OP_BUY');
    expect(code).toContain('OpenBuy(0.01, InpSL, InpTP)');
    // EA 骨架
    expect(code).toContain('#property strict');
    expect(code).toContain('int OnInit()');
    expect(code).toContain('void OnTick()');
    expect(code).toContain('void OnDeinit(');
  });

  it('马丁/网格参数：生成加仓逻辑（层数/倍数/间距）', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: null,
          actions: [{ type: 'buy', lot: 0.01, sl: 0, tp: 0, multiplier: 2, gridStep: 200, maxLayers: 5 }],
        },
      ],
      indicators: [],
    };
    const code = renderMQL4(cfg, ir);

    expect(code).toContain('CountOrders(OP_BUY)');
    expect(code).toContain('layers < 5');
    expect(code).toContain('LastOpenPrice(OP_BUY) - Ask >= 200 * Point');
    expect(code).toContain('LastOrderLot(OP_BUY) * 2');
  });

  it('使用 HA 指标：生成 HA_Color() helper 并在条件中调用', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: { type: 'compare', indicator: { func: 'HA', params: { color: 'bull' } }, op: '>', value: 0 },
          actions: [{ type: 'buy', lot: 0.01, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
      ],
      indicators: [{ func: 'HA', params: { color: 'bull' } }],
    };
    const code = renderMQL4(cfg, ir);

    expect(code).toContain('double HA_Color(int shift)');
    expect(code).toContain('HA_Color(1) > 0');
  });

  it('时间过滤：用 TimeHour/TimeMinute 渲染分钟区间', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: { type: 'time', from: '08:00', to: '22:00' },
          actions: [{ type: 'closeAll', lot: 0, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
      ],
      indicators: [],
    };
    const code = renderMQL4(cfg, ir);

    expect(code).toContain('TimeHour(TimeCurrent())');
    expect(code).toContain('TimeMinute(TimeCurrent())');
    expect(code).toContain('>= 480');
    expect(code).toContain('<= 1320');
    expect(code).toContain('CloseAllOrders();');
  });

  it('卖出与自定义代码条件', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: { type: 'custom', code: 'MyCustomCond()' },
          actions: [{ type: 'sell', lot: 0.02, sl: 30, tp: 60, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
      ],
      indicators: [],
    };
    const code = renderMQL4(cfg, ir);

    expect(code).toContain('(MyCustomCond())');
    expect(code).toContain('OrderSend(Symbol(), OP_SELL');
    expect(code).toContain('OpenSell(0.02, 30, 60)');
  });

  it('And/Or 嵌套条件正确组合', () => {
    const ir: StrategyIR = {
      branches: [
        {
          when: {
            type: 'or',
            left: { type: 'compare', indicator: { func: 'EMA', params: { period: 20 } }, op: '>', value: 5 },
            right: { type: 'compare', indicator: { func: 'BB', params: { period: 20, deviation: 2, band: 'lower' } }, op: '<', value: 1 },
          },
          actions: [{ type: 'closeBuy', lot: 0, sl: 0, tp: 0, multiplier: 1, gridStep: 0, maxLayers: 1 }],
        },
      ],
      indicators: [
        { func: 'EMA', params: { period: 20 } },
        { func: 'BB', params: { period: 20, deviation: 2, band: 'lower' } },
      ],
    };
    const code = renderMQL4(cfg, ir);

    expect(code).toContain('iMA(Symbol(), PERIOD_CURRENT, 20, 0, MODE_EMA, PRICE_CLOSE, 1) > 5');
    expect(code).toContain('iBands(Symbol(), PERIOD_CURRENT, 20, 2, 0, PRICE_CLOSE, MODE_LOWER, 1) < 1');
    expect(code).toContain('||');
    expect(code).toContain('CloseAllBuys();');
  });
});
