import type { EAConfig, IRAction, IRCondition, IndicatorSpec, StrategyIR } from '../types';

/**
 * IR → MQL5 源码。
 * 与 MQL4 版差异：指标用 OnInit 句柄 + OnTick CopyBuffer；交易走 CTrade（净持仓模型）；
 * 时间过滤用 MqlDateTime（MQL5 无 TimeHour）。
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

// —— 指标命名：同名指标去重后编号（rsi, rsi2, rsi3...） ——

interface IndicatorVar {
  spec: IndicatorSpec;
  base: string;   // rsi / macd / ema / bb / ha（变量名前缀）
  handle: string; // 句柄名（同创建参数的多个缓冲区共享一个句柄）
  value: (shift: number) => string; // rsi_1 / rsi_2 / HA_Color(1)
}

interface IndicatorHandle {
  name: string;               // bbHandle
  spec: IndicatorSpec;        // 任一代表 spec（band/line 不参与句柄创建）
}

const BASE_BY_FUNC: Record<IndicatorSpec['func'], string> = {
  RSI: 'rsi',
  MACD: 'macd',
  EMA: 'ema',
  BB: 'bb',
  HA: 'ha',
};

/** 句柄去重键：去掉仅用于选择缓冲区的参数（BB.band / MACD.line） */
function handleKeyOf(spec: IndicatorSpec): string {
  const p: Record<string, number | string> = { ...spec.params };
  if (spec.func === 'BB') delete p.band;
  if (spec.func === 'MACD') delete p.line;
  return `${spec.func}:${JSON.stringify(p)}`;
}

function nameIndicators(specs: IndicatorSpec[]): { vars: IndicatorVar[]; handles: IndicatorHandle[] } {
  const varCounters = new Map<string, number>();
  const handleByName = new Map<string, IndicatorHandle>();   // key -> handle
  const vars: IndicatorVar[] = [];

  for (const spec of specs) {
    const base = BASE_BY_FUNC[spec.func];
    const idx = (varCounters.get(base) ?? 0) + 1;
    varCounters.set(base, idx);
    const name = idx === 1 ? base : `${base}${idx}`;

    let handleName: string;
    if (spec.func === 'HA') {
      handleName = ''; // HA 无句柄
    } else {
      const key = handleKeyOf(spec);
      const existing = handleByName.get(key);
      if (existing) {
        handleName = existing.name;
      } else {
        handleName = `${name}Handle`;
        handleByName.set(key, { name: handleName, spec });
      }
    }

    vars.push({
      spec,
      base: name,
      handle: handleName,
      value: (shift: number) => (spec.func === 'HA' ? `HA_Color(${shift})` : `${name}_${shift}`),
    });
  }

  return { vars, handles: [...handleByName.values()] };
}

// —— 条件树 → 布尔表达式 ——

function condExpr(c: IRCondition, vars: IndicatorVar[]): string {
  switch (c.type) {
    case 'compare': {
      const v = fmtNum(c.value);
      const find = () => vars.find((iv) => JSON.stringify(iv.spec) === JSON.stringify(c.indicator))!;
      const cur = find().value(1);
      if (c.op === 'crossUp')
        return `(${cur} > ${v} && ${find().value(2)} <= ${v})`;
      if (c.op === 'crossDown')
        return `(${cur} < ${v} && ${find().value(2)} >= ${v})`;
      return `(${cur} ${c.op} ${v})`;
    }
    case 'and':
      return `(${condExpr(c.left, vars)} && ${condExpr(c.right, vars)})`;
    case 'or':
      return `(${condExpr(c.left, vars)} || ${condExpr(c.right, vars)})`;
    case 'time': {
      const [fh, fm] = parseHM(c.from);
      const [th, tm] = parseHM(c.to);
      return `(MinutesOfDay() >= ${fh * 60 + fm} && MinutesOfDay() <= ${th * 60 + tm})`;
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
  const ask = 'SymbolInfoDouble(_Symbol, SYMBOL_ASK)';
  const bid = 'SymbolInfoDouble(_Symbol, SYMBOL_BID)';

  switch (a.type) {
    case 'buy':
      if (a.gridStep > 0 || a.multiplier > 1) {
        return [
          `{`,
          `   int layers = CountOrders(POSITION_TYPE_BUY);`,
          `   if (layers == 0)`,
          `   {`,
          `      OpenBuy(${lot}, ${sl}, ${tp});`,
          `   }`,
          `   else if (layers < ${fmtNum(a.maxLayers)} && LastOpenPrice(POSITION_TYPE_BUY) - ${ask} >= ${fmtNum(a.gridStep)} * _Point)`,
          `   {`,
          `      OpenBuy(NormalizeDouble(LastOrderLot(POSITION_TYPE_BUY) * ${fmtNum(a.multiplier)}, 2), ${sl}, ${tp});`,
          `   }`,
          `}`,
        ];
      }
      return [`if (CountOrders(POSITION_TYPE_BUY) == 0) OpenBuy(${lot}, ${sl}, ${tp});`];
    case 'sell':
      if (a.gridStep > 0 || a.multiplier > 1) {
        return [
          `{`,
          `   int layers = CountOrders(POSITION_TYPE_SELL);`,
          `   if (layers == 0)`,
          `   {`,
          `      OpenSell(${lot}, ${sl}, ${tp});`,
          `   }`,
          `   else if (layers < ${fmtNum(a.maxLayers)} && ${bid} - LastOpenPrice(POSITION_TYPE_SELL) >= ${fmtNum(a.gridStep)} * _Point)`,
          `   {`,
          `      OpenSell(NormalizeDouble(LastOrderLot(POSITION_TYPE_SELL) * ${fmtNum(a.multiplier)}, 2), ${sl}, ${tp});`,
          `   }`,
          `}`,
        ];
      }
      return [`if (CountOrders(POSITION_TYPE_SELL) == 0) OpenSell(${lot}, ${sl}, ${tp});`];
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
int CountOrders(long type)
{
   int count = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0) continue;
      if (PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      if (PositionGetInteger(POSITION_TYPE) == type) count++;
   }
   return count;
}`;

const H_LAST_OPEN_PRICE = `
double LastOpenPrice(long type)
{
   double price = 0;
   datetime lastTime = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0) continue;
      if (PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      if (PositionGetInteger(POSITION_TYPE) != type) continue;
      if ((datetime)PositionGetInteger(POSITION_TIME) > lastTime)
      {
         lastTime = (datetime)PositionGetInteger(POSITION_TIME);
         price = PositionGetDouble(POSITION_PRICE_OPEN);
      }
   }
   return price;
}`;

const H_LAST_ORDER_LOT = `
double LastOrderLot(long type)
{
   double lots = 0;
   datetime lastTime = 0;
   for (int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0) continue;
      if (PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      if (PositionGetInteger(POSITION_TYPE) != type) continue;
      if ((datetime)PositionGetInteger(POSITION_TIME) > lastTime)
      {
         lastTime = (datetime)PositionGetInteger(POSITION_TIME);
         lots = PositionGetDouble(POSITION_VOLUME);
      }
   }
   return lots;
}`;

const H_OPEN_BUY = `
void OpenBuy(double lots, int slPoints, int tpPoints)
{
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double sl = (slPoints > 0) ? NormalizeDouble(ask - slPoints * _Point, _Digits) : 0;
   double tp = (tpPoints > 0) ? NormalizeDouble(ask + tpPoints * _Point, _Digits) : 0;
   if (!trade.Buy(lots, _Symbol, 0, sl, tp, "autoEA"))
      Print("OpenBuy failed, retcode ", trade.ResultRetcode());
}`;

const H_OPEN_SELL = `
void OpenSell(double lots, int slPoints, int tpPoints)
{
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl = (slPoints > 0) ? NormalizeDouble(bid + slPoints * _Point, _Digits) : 0;
   double tp = (tpPoints > 0) ? NormalizeDouble(bid - tpPoints * _Point, _Digits) : 0;
   if (!trade.Sell(lots, _Symbol, 0, sl, tp, "autoEA"))
      Print("OpenSell failed, retcode ", trade.ResultRetcode());
}`;

const H_CLOSE_BUYS = `
void CloseAllBuys()
{
   for (int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0) continue;
      if (PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      if (PositionGetInteger(POSITION_TYPE) != POSITION_TYPE_BUY) continue;
      if (!trade.PositionClose(ticket))
         Print("CloseBuy #", ticket, " failed, retcode ", trade.ResultRetcode());
   }
}`;

const H_CLOSE_SELLS = `
void CloseAllSells()
{
   for (int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0) continue;
      if (PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      if (PositionGetInteger(POSITION_TYPE) != POSITION_TYPE_SELL) continue;
      if (!trade.PositionClose(ticket))
         Print("CloseSell #", ticket, " failed, retcode ", trade.ResultRetcode());
   }
}`;

const H_CLOSE_ALL = `
void CloseAllOrders()
{
   for (int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0) continue;
      if (PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      if (!trade.PositionClose(ticket))
         Print("Close #", ticket, " failed, retcode ", trade.ResultRetcode());
   }
}`;

const H_HA_COLOR = `
// Heikin Ashi 颜色：+1 = 阳线，-1 = 阴线（基于收盘 K 线近似计算）
double HA_Color(int shift)
{
   MqlRates rates[];
   if (CopyRates(_Symbol, PERIOD_CURRENT, shift, 2, rates) < 2) return 0;
   ArraySetAsSeries(rates, true);
   double haOpen  = (rates[1].open + rates[1].close) / 2.0;
   double haClose = (rates[0].open + rates[0].high + rates[0].low + rates[0].close) / 4.0;
   return (haClose >= haOpen) ? 1.0 : -1.0;
}`;

const H_MINUTES_OF_DAY = `
int MinutesOfDay()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   return dt.hour * 60 + dt.min;
}`;

// —— 指标句柄创建语句 ——

function handleInitLine(h: IndicatorHandle): string {
  const p = h.spec.params;
  switch (h.spec.func) {
    case 'RSI':
      return `   ${h.name} = iRSI(_Symbol, PERIOD_CURRENT, ${p.period}, PRICE_CLOSE);`;
    case 'MACD':
      return `   ${h.name} = iMACD(_Symbol, PERIOD_CURRENT, ${p.fast}, ${p.slow}, ${p.signal}, PRICE_CLOSE);`;
    case 'EMA':
      return `   ${h.name} = iMA(_Symbol, PERIOD_CURRENT, ${p.period}, 0, MODE_EMA, PRICE_CLOSE);`;
    case 'BB':
      // MQL5 顺序：period, bands_shift, deviation, applied_price（与 MQL4 的 deviation/bands_shift 顺序相反）
      return `   ${h.name} = iBands(_Symbol, PERIOD_CURRENT, ${p.period}, 0, ${p.deviation}, PRICE_CLOSE);`;
    case 'HA':
      return ''; // HA 不需要句柄
  }
}

function bufferIndexOf(iv: IndicatorVar): number {
  switch (iv.spec.func) {
    case 'MACD':
      return iv.spec.params.line === 'signal' ? 1 : 0;
    case 'BB': {
      const band = iv.spec.params.band;
      return band === 'upper' ? 1 : band === 'lower' ? 2 : 0;
    }
    default:
      return 0; // RSI / EMA 主缓冲区
  }
}

// —— 主入口 ——

export function renderMQL5(config: EAConfig, ir: StrategyIR): string {
  const actions = ir.branches.flatMap((b) => b.actions);
  const { vars, handles } = nameIndicators(ir.indicators);
  const hasHA = vars.some((iv) => iv.spec.func === 'HA');
  const hasTime = ir.branches.some((b) => b.when && JSON.stringify(b.when).includes('"time"'));
  const hasBuy = actions.some((a) => a.type === 'buy');
  const hasSell = actions.some((a) => a.type === 'sell');
  const hasGrid = actions.some(
    (a) => (a.type === 'buy' || a.type === 'sell') && (a.gridStep > 0 || a.multiplier > 1)
  );

  // 全局句柄声明 / 创建 / 校验 / 释放（同创建参数的缓冲区共享一个句柄）
  const handleDecls = handles.map((h) => `int ${h.name} = INVALID_HANDLE;`);
  const handleInits = handles.map(handleInitLine);
  const handleChecks = handles.map((h) => `${h.name} == INVALID_HANDLE`).join(' || ');
  const handleReleases = handles
    .map((h) => `   if (${h.name} != INVALID_HANDLE) IndicatorRelease(${h.name});`)
    .join('\n');

  // OnTick 顶部指标取值（每个缓冲区变量各取 shift 1/2）
  const valueLines: string[] = vars
    .filter((iv) => iv.spec.func !== 'HA')
    .flatMap((iv) => {
      const bIdx = bufferIndexOf(iv);
      return [
        `   double ${iv.base}_1 = 0;`,
        `   if (CopyBuffer(${iv.handle}, ${bIdx}, 1, 1, buf) >= 1) ${iv.base}_1 = buf[0];`,
        `   double ${iv.base}_2 = 0;`,
        `   if (CopyBuffer(${iv.handle}, ${bIdx}, 2, 1, buf) >= 1) ${iv.base}_2 = buf[0];`,
      ];
    });

  const helpers: string[] = [];
  if (hasBuy || hasSell) helpers.push(H_COUNT_ORDERS);
  if (hasGrid) helpers.push(H_LAST_OPEN_PRICE, H_LAST_ORDER_LOT);
  if (hasBuy) helpers.push(H_OPEN_BUY);
  if (hasSell) helpers.push(H_OPEN_SELL);
  if (actions.some((a) => a.type === 'closeBuy')) helpers.push(H_CLOSE_BUYS);
  if (actions.some((a) => a.type === 'closeSell')) helpers.push(H_CLOSE_SELLS);
  if (actions.some((a) => a.type === 'closeAll')) helpers.push(H_CLOSE_ALL);
  if (hasHA) helpers.push(H_HA_COLOR);
  if (hasTime) helpers.push(H_MINUTES_OF_DAY);

  const tickLines: string[] = [];
  ir.branches.forEach((br, i) => {
    tickLines.push(`   // —— 分支 ${i + 1} ——`);
    const body = br.actions.flatMap((a) => actionLines(a));
    if (br.when) {
      tickLines.push(`   if (${condExpr(br.when, vars)})`);
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
#include <Trade\\Trade.mqh>

input double InpLots  = ${config.lotSize};   // 默认手数
input int    InpSL    = ${config.sl};        // 全局止损(点, 0=关闭)
input int    InpTP    = ${config.tp};        // 全局止盈(点, 0=关闭)
input int    InpMagic = ${magicOf(config.name)}; // 魔术号

CTrade trade;
int MagicNumber = 0;
${handleDecls.length ? '\n' + handleDecls.join('\n') : ''}

int OnInit()
{
   MagicNumber = InpMagic;
   trade.SetExpertMagicNumber(MagicNumber);
${handleInits.join('\n')}${handleChecks ? `\n   if (${handleChecks}) return(INIT_FAILED);` : ''}
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
${handleReleases || '   // 无需释放的指标句柄'}
}

void OnTick()
{
   double buf[];
${valueLines.length ? valueLines.join('\n') + '\n' : ''}
${tickLines.join('\n')}}${helpers.join('\n')}
`;
}
