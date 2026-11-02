const assert = require('node:assert/strict');
const Calc = require('./calculations.js');

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

const zero = Calc.futureValue(1000, 100, 1, 0);
near(zero.value, 2200);
near(zero.invested, 2200);
near(zero.gain, 0);

const compound = Calc.futureValue(0, 1000, 1, 12);
near(compound.value, 1000 * (Math.pow(1.01, 12) - 1) / 0.01);
near(compound.invested, 12000);

const knownFlows = [{ date: '2020-01-01', amount: -1000 }, { date: '2021-01-01', amount: 1100 }];
const rate = Calc.xirr(knownFlows);
near(rate, Math.pow(1.1, 365 / 366) - 1, 1e-7);
near(Calc.xnpv(rate, knownFlows), 0, 1e-6);
assert.equal(Calc.xirr([{ date: '2020-01-01', amount: -1000 }]), null);

const assets = [{ id: 'a', name: '测试资产', price: 110 }];
const transactions = [
  { id: '1', date: '2024-01-01', type: 'buy', assetId: 'a', amount: 1000, quantity: 10, fee: 0, purpose: 'base' },
  { id: '2', date: '2024-07-01', type: 'buy', assetId: 'a', amount: 1000, quantity: 10, fee: 0, purpose: 'reserve' },
  { id: '3', date: '2024-12-01', type: 'income', assetId: 'a', amount: 20, quantity: 0, fee: 0 },
];
const stats = Calc.calculateStats(transactions, assets, '2024-12-31');
near(stats.buyCost, 2000);
near(stats.currentValue, 2200);
near(stats.pnl, 220);
near(stats.returnRate, 0.11);
near(stats.baseInvested, 1000);
near(stats.reserveInvested, 1000);
near(stats.positions[0].averageCost, 100);
assert.ok(Number.isFinite(stats.annualizedReturn));

const drawdown = Calc.drawdownLevels(1000, 890, 50000);
near(drawdown.currentDrawdown, -0.11);
assert.equal(drawdown.rows[0].triggered, true);
assert.equal(drawdown.rows[1].triggered, false);
near(drawdown.rows[0].amount, 10000);
near(drawdown.rows[3].amount, 15000);

const rebalance = Calc.rebalance(140000, 50000, 80);
near(rebalance.total, 190000);
near(rebalance.targetEquity, 152000);
near(rebalance.adjustment, 12000);

console.log('全部计算测试通过：定投终值、XIRR、持仓收益、回撤档位与再平衡。');
