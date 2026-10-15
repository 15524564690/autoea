import type { EAConfig, IRAction, IRCondition, IndicatorSpec, StrategyIR } from '../types';

/**
 * IR → MQL4 源码。
 * 结构：头部注释 + input 参数 + OnInit/OnDeinit/OnTick + 按需注入的辅助函数。
 * 指标值统一取上一根收线 K 线（shift=1），穿越判断再用 shift=2。
 */

const fmtNum = (n: number): string => String(n);

function parseHM(s: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return [0, 0];
  return [Number(m[1]), Number(m[2])];
}

function magicOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 899999;
  return 100000 + h;
}

// —— 指标表达式 ——

function indicatorExpr(spec: IndicatorSpec, shift: number): string {
  const p = spec.params;
  switch (spec.func) {
    case 'RSI':
      return `iRSI(Symbol(), PERIOD_CURRENT, ${p.period}, PRICE_CLOSE, ${shift})`;
    case 'MACD':
      return `iMACD(Symbol(), PERIOD_CURRENT, ${p.fast}, ${p.slow}, ${p.signal}, PRICE_CLOSE, ${
        p.line === 'signal' ? 'MODE_SIGNAL' : 'MODE_MAIN'
      }, ${shift})`;
    case 'EMA':
      return `iMA(Symbol(), PERIOD_CURRENT, ${p.period}, 0, MODE_EMA, PRICE_CLOSE, ${shift})`;
    case 'BB': {
      const mode = p.band === 'upper' ? 'MODE_UPPER' : p.band === 'lower' ? 'MODE_LOWER' : 'MODE_MAIN';
      return `iBands(Symbol(), PERIOD_CURRENT, ${p.period}, ${p.deviation}, 0, PRICE_CLOSE, ${mode}, ${shift})`;
    }
    case 'HA':
      return `HA_Color(${shift})`;
  }
}

// —— 条件树 → 布尔表达式 ——

function condExpr(c: IRCondition): string {
  switch (c.type) {
    case 'compare': {
      const v = fmtNum(c.value);
      const cur = indicatorExpr(c.indicator, 1);
      if (c.op === 'crossUp')
        return `(${cur} > ${v} && ${indicatorExpr(c.indicator, 2)} <= ${v})`;
      if (c.op === 'crossDown')
        return `(${cur} < ${v} && ${indicatorExpr(c.indicator, 2)} >= ${v})`;
      return `(${cur} ${c.op} ${v})`;
    }
    case 'and':
      return `(${condExpr(c.left)} && ${condExpr(c.right)})`;
    case 'or':
      return `(${condExpr(c.left)} || ${condExpr(c.right)})`;
    case 'time': {
      const [fh, fm] = parseHM(c.from);
      const [th, tm] = parseHM(c.to);
      const now = `(TimeHour(TimeCurrent()) * 60 + TimeMinute(TimeCurrent()))`;
      return `(${now} >= ${fh * 60 + fm} && ${now} <= ${th * 60 + tm})`;
    }
    case 'custom':
      return `(${c.code})`;
  }
}

// —— 动作 → OnTick 内语句 ——

function actionLines(a: IRAction): string[] {
  const sl = a.sl > 0 ? fmtNum(a.sl) : 'InpSL';
  const tp = a.tp > 0 ? fmtNum(a.tp) : 'InpTP';
  const lot = a.lot > 0 ? fmtNum(a.lot) : 'InpLots';

  switch (a.type) {
    case 'buy':
      if (a.gridStep > 0 || a.multiplier > 1) {
        return [
          `{`,
          `   int layers = CountOrders(OP_BUY);`,
          `   if (layers == 0)`,
          `   {`,
          `      OpenBuy(${lot}, ${sl}, ${tp});`,
          `   }`,
          `   else if (layers < ${fmtNum(a.maxLayers)} && LastOpenPrice(OP_BUY) - Ask >= ${fmtNum(a.gridStep)} * Point)`,
          `   {`,
          `      OpenBuy(NormalizeDouble(LastOrderLot(OP_BUY) * ${fmtNum(a.multiplier)}, 2), ${sl}, ${tp});`,
          `   }`,
          `}`,
        ];
      }
      return [`if (CountOrders(OP_BUY) == 0) OpenBuy(${lot}, ${sl}, ${tp});`];
    case 'sell':
      if (a.gridStep > 0 || a.multiplier > 1) {
        return [
          `{`,
          `   int layers = CountOrders(OP_SELL);`,
          `   if (layers == 0)`,
          `   {`,
          `      OpenSell(${lot}, ${sl}, ${tp});`,
          `   }`,
          `   else if (layers < ${fmtNum(a.maxLayers)} && Bid - LastOpenPrice(OP_SELL) >= ${fmtNum(a.gridStep)} * Point)`,
          `   {`,
          `      OpenSell(NormalizeDouble(LastOrderLot(OP_SELL) * ${fmtNum(a.multiplier)}, 2), ${sl}, ${tp});`,
          `   }`,
          `}`,
        ];
      }
      return [`if (CountOrders(OP_SELL) == 0) OpenSell(${lot}, ${sl}, ${tp});`];
    case 'closeBuy':
      return ['CloseAllBuys();'];
    case 'closeSell':
      return ['CloseAllSells();'];
    case 'closeAll':
      return ['CloseAllOrders();'];
  }
}

// —— 辅助函数库（按需注入） ——

const H_COUNT_ORDERS = `
int CountOrders(int type)
{
   int count = 0;
   for (int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if (OrderSymbol() != Symbol() || OrderMagicNumber() != MagicNumber) continue;
      if (OrderType() == type) count++;
   }
   return count;
}`;

const H_LAST_OPEN_PRICE = `
double LastOpenPrice(int type)
{
   double price = 0;
   datetime lastTime = 0;
   for (int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if (OrderSymbol() != Symbol() || OrderMagicNumber() != MagicNumber) continue;
      if (OrderType() != type) continue;
      if (OrderOpenTime() > lastTime) { lastTime = OrderOpenTime(); price = OrderOpenPrice(); }
   }
   return price;
}`;

const H_LAST_ORDER_LOT = `
double LastOrderLot(int type)
{
   double lots = 0;
   datetime lastTime = 0;
   for (int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if (OrderSymbol() != Symbol() || OrderMagicNumber() != MagicNumber) continue;
      if (OrderType() != type) continue;
      if (OrderOpenTime() > lastTime) { lastTime = OrderOpenTime(); lots = OrderLots(); }
   }
   return lots;
}`;

const H_OPEN_BUY = `
void OpenBuy(double lots, int slPoints, int tpPoints)
{
   double price = Ask;
   double sl = (slPoints > 0) ? NormalizeDouble(price - slPoints * Point, Digits) : 0;
   double tp = (tpPoints > 0) ? NormalizeDouble(price + tpPoints * Point, Digits) : 0;
   int ticket = OrderSend(Symbol(), OP_BUY, lots, price, 30, sl, tp, "autoEA", MagicNumber, 0, clrDodgerBlue);
   if (ticket < 0) Print("OpenBuy failed, error ", GetLastError());
}`;

const H_OPEN_SELL = `
void OpenSell(double lots, int slPoints, int tpPoints)
{
   double price = Bid;
   double sl = (slPoints > 0) ? NormalizeDouble(price + slPoints * Point, Digits) : 0;
   double tp = (tpPoints > 0) ? NormalizeDouble(price - tpPoints * Point, Digits) : 0;
   int ticket = OrderSend(Symbol(), OP_SELL, lots, price, 30, sl, tp, "autoEA", MagicNumber, 0, clrTomato);
   if (ticket < 0) Print("OpenSell failed, error ", GetLastError());
}`;

const H_CLOSE_BUYS = `
void CloseAllBuys()
{
   for (int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if (OrderSymbol() != Symbol() || OrderMagicNumber() != MagicNumber) continue;
      if (OrderType() != OP_BUY) continue;
      if (!OrderClose(OrderTicket(), OrderLots(), Bid, 30, clrRed))
         Print("CloseBuy #", OrderTicket(), " failed, error ", GetLastError());
   }
}`;

const H_CLOSE_SELLS = `
void CloseAllSells()
{
   for (int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if (OrderSymbol() != Symbol() || OrderMagicNumber() != MagicNumber) continue;
      if (OrderType() != OP_SELL) continue;
      if (!OrderClose(OrderTicket(), OrderLots(), Ask, 30, clrRed))
         Print("CloseSell #", OrderTicket(), " failed, error ", GetLastError());
   }
}`;

const H_CLOSE_ALL = `
void CloseAllOrders()
{
   for (int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if (OrderSymbol() != Symbol() || OrderMagicNumber() != MagicNumber) continue;
      if (OrderType() != OP_BUY && OrderType() != OP_SELL) continue;
      double price = (OrderType() == OP_BUY) ? Bid : Ask;
      if (!OrderClose(OrderTicket(), OrderLots(), price, 30, clrRed))
         Print("Close #", OrderTicket(), " failed, error ", GetLastError());
   }
}`;

const H_HA_COLOR = `
// Heikin Ashi 颜色：+1 = 阳线，-1 = 阴线（基于收盘 K 线近似计算）
double HA_Color(int shift)
{
   double haOpen  = (iOpen(Symbol(), PERIOD_CURRENT, shift + 1) + iClose(Symbol(), PERIOD_CURRENT, shift + 1)) / 2.0;
   double haClose = (iOpen(Symbol(), PERIOD_CURRENT, shift) + iHigh(Symbol(), PERIOD_CURRENT, shift)
                   + iLow(Symbol(), PERIOD_CURRENT, shift) + iClose(Symbol(), PERIOD_CURRENT, shift)) / 4.0;
   return (haClose >= haOpen) ? 1.0 : -1.0;
}`;

// —— 主入口 ——

export function renderMQL4(config: EAConfig, ir: StrategyIR): string {
  const actions = ir.branches.flatMap((b) => b.actions);
  const hasHA = ir.indicators.some((i) => i.func === 'HA');
  const hasBuy = actions.some((a) => a.type === 'buy');
  const hasSell = actions.some((a) => a.type === 'sell');
  const hasGrid = actions.some(
    (a) => (a.type === 'buy' || a.type === 'sell') && (a.gridStep > 0 || a.multiplier > 1)
  );

  const helpers: string[] = [];
  if (hasBuy || hasSell) helpers.push(H_COUNT_ORDERS);
  if (hasGrid) helpers.push(H_LAST_OPEN_PRICE, H_LAST_ORDER_LOT);
  if (hasBuy) helpers.push(H_OPEN_BUY);
  if (hasSell) helpers.push(H_OPEN_SELL);
  if (actions.some((a) => a.type === 'closeBuy')) helpers.push(H_CLOSE_BUYS);
  if (actions.some((a) => a.type === 'closeSell')) helpers.push(H_CLOSE_SELLS);
  if (actions.some((a) => a.type === 'closeAll')) helpers.push(H_CLOSE_ALL);
  if (hasHA) helpers.push(H_HA_COLOR);

  const tickLines: string[] = [];
  ir.branches.forEach((br, i) => {
    tickLines.push(`   // —— 分支 ${i + 1} ——`);
    const body = br.actions.flatMap((a) => actionLines(a));
    if (br.when) {
      tickLines.push(`   if (${condExpr(br.when)})`);
      tickLines.push('   {');
      body.forEach((l) => tickLines.push('      ' + l));
      tickLines.push('   }');
    } else {
      body.forEach((l) => tickLines.push('   ' + l));
    }
    tickLines.push('');
  });

  return `//+------------------------------------------------------------------+
//| ${config.name}
//| ${config.symbol} ${config.timeframe} — 由 autoEA 策略组合器自动生成
//+------------------------------------------------------------------+
#property strict

input double InpLots  = ${config.lotSize};   // 默认手数
input int    InpSL    = ${config.sl};        // 全局止损(点, 0=关闭)
input int    InpTP    = ${config.tp};        // 全局止盈(点, 0=关闭)
input int    InpMagic = ${magicOf(config.name)}; // 魔术号

int MagicNumber = 0;

int OnInit()
{
   MagicNumber = InpMagic;
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
}

void OnTick()
{
${tickLines.join('\n')}}${helpers.join('\n')}
`;
}
