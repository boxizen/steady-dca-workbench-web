(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DCACalculations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DAY = 24 * 60 * 60 * 1000;
  const asDate = (value) => value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  const finite = (value) => Number.isFinite(Number(value));

  function futureValue(initial, monthly, years, annualRate) {
    initial = Number(initial) || 0;
    monthly = Number(monthly) || 0;
    const months = Math.max(0, Math.round((Number(years) || 0) * 12));
    const monthlyRate = Number(annualRate) / 100 / 12;
    const growth = Math.pow(1 + monthlyRate, months);
    const contributionValue = monthlyRate === 0
      ? monthly * months
      : monthly * ((growth - 1) / monthlyRate);
    const invested = initial + monthly * months;
    const value = initial * growth + contributionValue;
    return { value, invested, gain: value - invested, months };
  }

  function projectionSeries(initial, monthly, years, annualRate) {
    const points = [];
    const wholeYears = Math.max(0, Number(years) || 0);
    for (let year = 0; year <= wholeYears; year += 1) {
      points.push({ year, ...futureValue(initial, monthly, year, annualRate) });
    }
    return points;
  }

  function xnpv(rate, flows) {
    if (!flows.length) return NaN;
    const first = asDate(flows[0].date).getTime();
    return flows.reduce((sum, flow) => {
      const years = (asDate(flow.date).getTime() - first) / (365 * DAY);
      return sum + Number(flow.amount) / Math.pow(1 + rate, years);
    }, 0);
  }

  function xirr(flows) {
    const clean = flows
      .filter((flow) => flow && finite(flow.amount) && Number(flow.amount) !== 0 && asDate(flow.date).toString() !== 'Invalid Date')
      .map((flow) => ({ date: flow.date, amount: Number(flow.amount) }))
      .sort((a, b) => asDate(a.date) - asDate(b.date));
    if (clean.length < 2 || !clean.some((f) => f.amount > 0) || !clean.some((f) => f.amount < 0)) return null;
    const firstTime = asDate(clean[0].date).getTime();
    const lastTime = asDate(clean[clean.length - 1].date).getTime();
    if (lastTime <= firstTime) return null;

    let low = -0.9999;
    let high = 1;
    let lowValue = xnpv(low, clean);
    let highValue = xnpv(high, clean);
    let attempts = 0;
    while (lowValue * highValue > 0 && attempts < 12) {
      high *= 2;
      highValue = xnpv(high, clean);
      attempts += 1;
    }
    if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) return null;

    for (let i = 0; i < 200; i += 1) {
      const middle = (low + high) / 2;
      const middleValue = xnpv(middle, clean);
      if (Math.abs(middleValue) < 1e-7) return middle;
      if (lowValue * middleValue <= 0) {
        high = middle;
        highValue = middleValue;
      } else {
        low = middle;
        lowValue = middleValue;
      }
    }
    return (low + high) / 2;
  }

  function calculateStats(transactions, assets, valuationDate) {
    const positions = {};
    const flows = [];
    let buyCost = 0;
    let sellProceeds = 0;
    let income = 0;
    let baseInvested = 0;
    let reserveInvested = 0;

    const sorted = [...transactions].sort((a, b) => asDate(a.date) - asDate(b.date));
    sorted.forEach((tx) => {
      const amount = Math.abs(Number(tx.amount) || 0);
      const fee = Math.abs(Number(tx.fee) || 0);
      const quantity = Math.abs(Number(tx.quantity) || 0);
      if (!positions[tx.assetId]) positions[tx.assetId] = { quantity: 0, remainingCost: 0 };
      const position = positions[tx.assetId];

      if (tx.type === 'buy') {
        const gross = amount + fee;
        buyCost += gross;
        position.quantity += quantity;
        position.remainingCost += gross;
        flows.push({ date: tx.date, amount: -gross });
        if (tx.purpose === 'base') baseInvested += gross;
        if (tx.purpose === 'reserve') reserveInvested += gross;
      } else if (tx.type === 'sell') {
        const net = Math.max(0, amount - fee);
        const oldQuantity = position.quantity;
        const averageCost = oldQuantity > 0 ? position.remainingCost / oldQuantity : 0;
        position.quantity = Math.max(0, oldQuantity - quantity);
        position.remainingCost = Math.max(0, position.remainingCost - averageCost * Math.min(quantity, oldQuantity));
        sellProceeds += net;
        flows.push({ date: tx.date, amount: net });
      } else if (tx.type === 'income') {
        const net = Math.max(0, amount - fee);
        income += net;
        flows.push({ date: tx.date, amount: net });
      }
    });

    let currentValue = 0;
    const missingPrices = [];
    const positionRows = Object.entries(positions)
      .filter(([, position]) => position.quantity > 1e-10)
      .map(([assetId, position]) => {
        const asset = assets.find((item) => item.id === assetId);
        const price = Number(asset?.price) || 0;
        if (price <= 0) missingPrices.push(asset?.name || assetId);
        const value = position.quantity * price;
        currentValue += value;
        return {
          assetId,
          name: asset?.name || assetId,
          ticker: asset?.ticker || '',
          quantity: position.quantity,
          averageCost: position.quantity > 0 ? position.remainingCost / position.quantity : 0,
          price,
          value,
          unrealizedPnl: value - position.remainingCost,
        };
      });

    const pnl = currentValue + sellProceeds + income - buyCost;
    const returnRate = buyCost > 0 ? pnl / buyCost : null;
    const terminalDate = valuationDate || new Date().toISOString().slice(0, 10);
    if (currentValue > 0) flows.push({ date: terminalDate, amount: currentValue });

    return {
      buyCost,
      sellProceeds,
      income,
      netInvested: buyCost - sellProceeds,
      currentValue,
      pnl,
      returnRate,
      annualizedReturn: xirr(flows),
      baseInvested,
      reserveInvested,
      positions: positionRows,
      missingPrices,
    };
  }

  function drawdownLevels(high, current, reserve) {
    high = Number(high) || 0;
    current = Number(current) || 0;
    reserve = Number(reserve) || 0;
    const levels = [0.10, 0.15, 0.20, 0.30];
    const weights = [0.20, 0.20, 0.30, 0.30];
    const rows = levels.map((level, index) => {
      const trigger = high * (1 - level);
      return {
        level,
        trigger,
        amount: reserve * weights[index],
        triggered: high > 0 && current > 0 && current <= trigger,
      };
    });
    return {
      currentDrawdown: high > 0 ? current / high - 1 : null,
      rows,
      next: rows.find((row) => !row.triggered) || null,
    };
  }

  function rebalance(equity, cash, targetEquityRate) {
    equity = Number(equity) || 0;
    cash = Number(cash) || 0;
    const total = equity + cash;
    const target = total * (Number(targetEquityRate) || 0) / 100;
    return { total, targetEquity: target, adjustment: target - equity };
  }

  return { futureValue, projectionSeries, xnpv, xirr, calculateStats, drawdownLevels, rebalance };
});
