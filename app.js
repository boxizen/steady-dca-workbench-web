(function () {
  'use strict';

  const Calc = window.DCACalculations;
  const STORAGE_KEY = 'steady-dca-workbench-v1';
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const typeLabels = { buy: '买入', sell: '卖出', income: '分红／利息' };
  const purposeLabels = { base: '基础定投', reserve: '回撤加仓', permanent: '永久短债', other: '其他' };
  const drawdownPresets = {
    sp: { high: 7818.9301757812, current: 7580.0698242188, date: '2026-10-30' },
    ndx: { high: 31224.470703125, current: 28384.849609375, date: '2026-10-30' },
    csi: { high: 5976.53, current: 5592.45, date: '2026-10-30' },
  };

  function defaultState() {
    return {
      version: 1,
      activePlan: 'us',
      activeTab: 'overview',
      plans: {
        // 公开部署仅使用示例预算；真实数据可通过 JSON 备份导入。
        us: {
          name: '嘉信美元计划', currency: 'USD', total: 120000,
          baseRate: 0.60, reserveRate: 0.20, permanentRate: 0.20, months: 48,
          description: '嘉信美元资产 · 48 个月建仓 · 标普／纳指 80/20',
          projection: { initial: 0, monthly: 1500, years: 4, low: 3, base: 6, high: 9 },
          rebalance: { equity: 60000, cash: 20000, target: 80 },
        },
        cn: {
          name: '人民币红利计划', currency: 'CNY', total: 360000,
          baseRate: 0.80, reserveRate: 0.20, permanentRate: 0, months: 36,
          description: '人民币红利资产 · 36 个月建仓 · 首选候选 515080',
          projection: { initial: 0, monthly: 8000, years: 3, low: 2, base: 5, high: 8 },
          rebalance: { equity: 160000, cash: 40000, target: 80 },
        },
      },
      assets: [
        { id: 'us-sp', plan: 'us', name: '标普 500 ETF', ticker: 'VOO / IVV / SPLG', price: 0 },
        { id: 'us-ndx', plan: 'us', name: '纳斯达克 100 ETF', ticker: 'QQQM', price: 0 },
        { id: 'us-sgov', plan: 'us', name: '美国短债', ticker: 'SGOV / T-bill', price: 0 },
        { id: 'cn-515080', plan: 'cn', name: '招商中证红利 ETF', ticker: '515080', price: 0 },
        { id: 'cn-512890', plan: 'cn', name: '红利低波 ETF', ticker: '512890', price: 0 },
      ],
      transactions: [],
    };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.assets) || !Array.isArray(raw.transactions)) {
      throw new Error('备份格式不正确');
    }
    const base = defaultState();
    const normalized = {
      ...base,
      ...raw,
      plans: {
        us: { ...base.plans.us, ...(raw.plans?.us || {}) },
        cn: { ...base.plans.cn, ...(raw.plans?.cn || {}) },
      },
      assets: raw.assets.filter((asset) => asset && asset.id && asset.name && ['us', 'cn'].includes(asset.plan)),
      transactions: raw.transactions.filter((tx) => tx && tx.id && tx.date && tx.assetId && ['us', 'cn'].includes(tx.plan)),
    };
    normalized.activePlan = ['us', 'cn'].includes(normalized.activePlan) ? normalized.activePlan : 'us';
    normalized.activeTab = ['overview', 'transactions', 'projection', 'tools'].includes(normalized.activeTab) ? normalized.activeTab : 'overview';
    return normalized;
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeState(JSON.parse(saved)) : defaultState();
    } catch (error) {
      console.warn('读取本地数据失败：', error);
      return defaultState();
    }
  }

  let state = loadState();
  let toastTimer;

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { toast('本地保存失败，请立即导出 JSON 备份'); }
  }

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2400);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function today() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function plan() { return state.plans[state.activePlan]; }
  function planAssets() { return state.assets.filter((asset) => asset.plan === state.activePlan); }
  function planTransactions() { return state.transactions.filter((tx) => tx.plan === state.activePlan); }
  function assetById(id) { return state.assets.find((asset) => asset.id === id); }
  function baseBudget() { return plan().total * plan().baseRate; }
  function reserveBudget() { return plan().total * plan().reserveRate; }
  function monthlyBudget() { return baseBudget() / plan().months; }

  function money(value, maximumFractionDigits = 2) {
    if (!Number.isFinite(Number(value))) return '—';
    const symbol = plan().currency === 'USD' ? '$' : '¥';
    return `${symbol}${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: maximumFractionDigits, maximumFractionDigits })}`;
  }

  function plainMoney(value, currency, digits = 2) {
    const symbol = currency === 'USD' ? '$' : '¥';
    return `${symbol}${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }

  function percent(value, digits = 2) {
    return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(digits)}%` : '—';
  }

  function signedMoney(value) {
    if (!Number.isFinite(Number(value))) return '—';
    return `${Number(value) > 0 ? '+' : Number(value) < 0 ? '-' : ''}${money(Math.abs(Number(value)))}`;
  }

  function colorNumber(element, value) {
    element.classList.remove('positive', 'negative');
    if (Number(value) > 0) element.classList.add('positive');
    if (Number(value) < 0) element.classList.add('negative');
  }

  function emptyRow(columns, text) {
    return `<tr><td colspan="${columns}" class="empty">${escapeHtml(text)}</td></tr>`;
  }

  function currentStats() {
    return Calc.calculateStats(planTransactions(), state.assets, today());
  }

  function renderOverview() {
    const stats = currentStats();
    const hasMissing = stats.missingPrices.length > 0;
    $('missingPriceNotice').classList.toggle('hidden', !hasMissing);
    if (hasMissing) $('missingPriceNotice').textContent = `请先更新以下持仓价格，否则总收益与年化收益率暂不完整：${stats.missingPrices.join('、')}`;

    $('statInvested').textContent = money(stats.buyCost);
    $('statNetInvested').textContent = `净投入 ${money(stats.netInvested)}`;
    $('statValue').textContent = money(stats.currentValue);
    $('statPnl').textContent = hasMissing ? '待定价' : signedMoney(stats.pnl);
    colorNumber($('statPnl'), hasMissing ? 0 : stats.pnl);
    $('statReturn').textContent = hasMissing
      ? '更新全部持仓价格后显示'
      : `总收益率 ${percent(stats.returnRate)} · 现金收益 ${money(stats.income)}`;
    $('statXirr').textContent = !hasMissing && stats.annualizedReturn !== null ? percent(stats.annualizedReturn) : '—';

    $('positionsBody').innerHTML = stats.positions.length ? stats.positions.map((position) => {
      const pnl = position.price > 0 ? signedMoney(position.unrealizedPnl) : '—';
      return `<tr>
        <td><div class="asset-name">${escapeHtml(position.name)}</div><div class="asset-ticker">${escapeHtml(position.ticker)}</div></td>
        <td class="number">${position.quantity.toLocaleString('zh-CN', { maximumFractionDigits: 6 })}</td>
        <td class="number">${money(position.averageCost, 4)}</td>
        <td class="number"><input class="price-input" data-asset="${escapeHtml(position.assetId)}" type="number" min="0" step="0.0001" value="${position.price || ''}" placeholder="待更新" aria-label="${escapeHtml(position.name)}最新价格"></td>
        <td class="number">${position.price > 0 ? money(position.value) : '—'}</td>
        <td class="number ${position.price > 0 ? (position.unrealizedPnl >= 0 ? 'positive' : 'negative') : ''}">${pnl}</td>
      </tr>`;
    }).join('') : emptyRow(6, '还没有持仓。点击“记一笔”录入实际成交。');

    const baseRate = baseBudget() > 0 ? stats.baseInvested / baseBudget() : 0;
    const reserveRate = reserveBudget() > 0 ? stats.reserveInvested / reserveBudget() : 0;
    $('baseProgressText').textContent = percent(baseRate, 1);
    $('baseProgressBar').style.width = `${Math.min(100, Math.max(0, baseRate * 100))}%`;
    $('baseProgressAmount').textContent = `${money(stats.baseInvested)} / ${money(baseBudget())} · ${plan().months} 个月`;
    $('reserveProgressText').textContent = percent(reserveRate, 1);
    $('reserveProgressBar').style.width = `${Math.min(100, Math.max(0, reserveRate * 100))}%`;
    $('reserveProgressAmount').textContent = `${money(stats.reserveInvested)} / ${money(reserveBudget())} · 剩余 ${money(Math.max(0, reserveBudget() - stats.reserveInvested))}`;
    $('monthlyBudget').textContent = money(monthlyBudget());
    $('permanentBudget').textContent = plan().permanentRate > 0 ? money(plan().total * plan().permanentRate) : '未单独设置';
    $('realizedIncome').textContent = money(stats.sellProceeds + stats.income);

    const recent = [...planTransactions()].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
    $('recentBody').innerHTML = recent.length ? recent.map((tx) => transactionRow(tx, false)).join('') : emptyRow(6, '暂无记录，实际成交后再计入。');
  }

  function transactionRow(tx, withActions = true) {
    const asset = assetById(tx.assetId);
    const type = typeLabels[tx.type] || tx.type;
    const purpose = tx.type === 'income' ? '—' : (purposeLabels[tx.purpose] || '其他');
    const badgeClass = tx.purpose === 'reserve' ? 'gold' : tx.type === 'income' ? 'gray' : '';
    return `<tr>
      <td>${escapeHtml(tx.date)}</td>
      <td><div class="asset-name">${escapeHtml(asset?.name || tx.assetId)}</div><div class="asset-ticker">${escapeHtml(asset?.ticker || '')}</div></td>
      <td><span class="badge ${badgeClass}">${escapeHtml(type)}</span></td>
      <td>${escapeHtml(purpose)}</td>
      <td class="number">${money(tx.amount)}</td>
      <td class="number">${tx.type === 'income' ? '—' : Number(tx.quantity || 0).toLocaleString('zh-CN', { maximumFractionDigits: 6 })}</td>
      ${withActions ? `<td class="number">${money(tx.fee || 0)}</td><td>${escapeHtml(tx.note || '—')}</td><td class="number"><button class="btn ghost small" data-edit="${escapeHtml(tx.id)}">编辑</button><button class="btn ghost small danger" data-delete="${escapeHtml(tx.id)}">删除</button></td>` : ''}
    </tr>`;
  }

  function renderTransactions() {
    const transactions = [...planTransactions()].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
    $('transactionCount').textContent = `${transactions.length} 条记录`;
    $('transactionsBody').innerHTML = transactions.length ? transactions.map((tx) => transactionRow(tx, true)).join('') : emptyRow(9, '暂无交易记录。');
  }

  function renderAssetOptions(selectedId) {
    const options = planAssets().map((asset) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.name)}${asset.ticker ? ` · ${escapeHtml(asset.ticker)}` : ''}</option>`).join('');
    $('txAsset').innerHTML = `${options}<option value="__new__">＋ 新增标的…</option>`;
    if (selectedId && (planAssets().some((asset) => asset.id === selectedId))) $('txAsset').value = selectedId;
    $('customAssetFields').classList.toggle('hidden', $('txAsset').value !== '__new__');
  }

  function resetForm() {
    $('transactionForm').reset();
    $('editingId').value = '';
    $('formTitle').textContent = '记一笔交易';
    $('saveTransaction').textContent = '保存记录';
    $('cancelEdit').classList.add('hidden');
    $('txAsset').disabled = false;
    $('txDate').value = today();
    $('txFee').value = 0;
    renderAssetOptions();
    updateFormType();
    updateCalculatedPrice();
  }

  function updateFormType() {
    const isIncome = $('txType').value === 'income';
    $('purposeField').classList.toggle('hidden', isIncome);
    $('quantityField').classList.toggle('hidden', isIncome);
    $('txQuantity').required = !isIncome;
  }

  function updateCalculatedPrice() {
    const amount = Number($('txAmount').value) || 0;
    const quantity = Number($('txQuantity').value) || 0;
    $('calculatedPrice').textContent = amount > 0 && quantity > 0 && $('txType').value !== 'income' ? `成交均价 ≈ ${money(amount / quantity, 4)}` : '';
  }

  function editTransaction(id) {
    const tx = state.transactions.find((item) => item.id === id && item.plan === state.activePlan);
    if (!tx) return;
    $('editingId').value = tx.id;
    $('txDate').value = tx.date;
    $('txType').value = tx.type;
    renderAssetOptions(tx.assetId);
    $('txAsset').disabled = true;
    $('txPurpose').value = tx.purpose || 'other';
    $('txAmount').value = tx.amount;
    $('txQuantity').value = tx.quantity || '';
    $('txFee').value = tx.fee || 0;
    $('txNote').value = tx.note || '';
    $('formTitle').textContent = '编辑交易';
    $('saveTransaction').textContent = '保存修改';
    $('cancelEdit').classList.remove('hidden');
    updateFormType();
    updateCalculatedPrice();
    setTab('transactions');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function availableQuantity(assetId, excludeId) {
    return state.transactions
      .filter((tx) => tx.plan === state.activePlan && tx.assetId === assetId && tx.id !== excludeId)
      .reduce((sum, tx) => sum + (tx.type === 'buy' ? Number(tx.quantity) || 0 : tx.type === 'sell' ? -(Number(tx.quantity) || 0) : 0), 0);
  }

  function submitTransaction(event) {
    event.preventDefault();
    const type = $('txType').value;
    const amount = Number($('txAmount').value);
    const quantity = type === 'income' ? 0 : Number($('txQuantity').value);
    const fee = Number($('txFee').value) || 0;
    const editingId = $('editingId').value;
    let assetId = $('txAsset').value;
    if (!$('txDate').value || !(amount > 0) || fee < 0) return toast('请填写有效日期、金额和费用');
    if (type !== 'income' && !(quantity > 0)) return toast('买入或卖出必须填写有效份额');

    if (assetId === '__new__') {
      const name = $('txCustomAsset').value.trim();
      if (!name) return toast('请填写新标的名称');
      assetId = `asset-${Date.now()}`;
      state.assets.push({ id: assetId, plan: state.activePlan, name, ticker: $('txCustomTicker').value.trim(), price: 0 });
    }
    if (type === 'sell' && quantity > availableQuantity(assetId, editingId) + 1e-8) return toast('卖出份额超过当前可用持仓');

    const previous = editingId ? state.transactions.find((tx) => tx.id === editingId) : null;
    const tx = {
      id: editingId || `tx-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      plan: state.activePlan,
      date: $('txDate').value,
      type,
      assetId,
      purpose: type === 'income' ? 'other' : $('txPurpose').value,
      amount,
      quantity,
      fee,
      note: $('txNote').value.trim(),
      createdAt: previous?.createdAt || new Date().toISOString(),
    };
    if (editingId) {
      const index = state.transactions.findIndex((item) => item.id === editingId);
      state.transactions[index] = tx;
    } else {
      state.transactions.push(tx);
    }
    saveState();
    resetForm();
    renderAll();
    toast(editingId ? '记录已更新' : '记录已保存');
  }

  function deleteTransaction(id) {
    const tx = state.transactions.find((item) => item.id === id && item.plan === state.activePlan);
    if (!tx || !window.confirm(`确定删除 ${tx.date} 的这条${typeLabels[tx.type]}记录？`)) return;
    state.transactions = state.transactions.filter((item) => item.id !== id);
    saveState();
    if ($('editingId').value === id) resetForm();
    renderAll();
    toast('记录已删除');
  }

  function projectionValues() {
    return {
      initial: Number($('projectionInitial').value) || 0,
      monthly: Number($('projectionMonthly').value) || 0,
      years: Math.min(50, Math.max(0, Number($('projectionYears').value) || 0)),
      low: Number($('projectionLow').value) || 0,
      base: Number($('projectionBase').value) || 0,
      high: Number($('projectionHigh').value) || 0,
    };
  }

  function loadProjection() {
    const values = plan().projection;
    ['Initial', 'Monthly', 'Years', 'Low', 'Base', 'High'].forEach((suffix) => {
      $(`projection${suffix}`).value = values[suffix.toLowerCase()];
    });
    renderProjection();
  }

  function renderProjection() {
    const values = projectionValues();
    plan().projection = values;
    const scenarios = [
      { key: 'low', label: '谨慎情景', rate: values.low },
      { key: 'base', label: '中性情景', rate: values.base },
      { key: 'high', label: '乐观情景', rate: values.high },
    ];
    $('scenarioGrid').innerHTML = scenarios.map((scenario) => {
      const result = Calc.futureValue(values.initial, values.monthly, values.years, scenario.rate);
      return `<div class="scenario ${scenario.key === 'base' ? 'featured' : ''}">
        <div class="scenario-label">${scenario.label} · 年化 ${scenario.rate}%</div>
        <div class="scenario-value">${money(result.value, 0)}</div>
        <div class="scenario-detail">累计本金 ${money(result.invested, 0)}<br>预估收益 ${signedMoney(result.gain)}</div>
      </div>`;
    }).join('');
    $('chartCaption').textContent = `${values.years} 年 · 年化 ${values.base}% · 月末投入`;
    renderProjectionChart(values);
    saveState();
  }

  function compactNumber(value) {
    const absolute = Math.abs(value);
    if (absolute >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (absolute >= 1000) return `${(value / 1000).toFixed(0)}k`;
    return value.toFixed(0);
  }

  function linePath(points, x, y) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point).toFixed(2)} ${y(point).toFixed(2)}`).join(' ');
  }

  function renderProjectionChart(values) {
    const data = Calc.projectionSeries(values.initial, values.monthly, values.years, values.base);
    const width = 620, height = 250, left = 48, right = 14, top = 18, bottom = 34;
    const innerWidth = width - left - right, innerHeight = height - top - bottom;
    const maxValue = Math.max(1, ...data.flatMap((point) => [point.value, point.invested]));
    const x = (point) => left + (values.years > 0 ? point.year / values.years : 0) * innerWidth;
    const y = (point) => top + innerHeight - point.value / maxValue * innerHeight;
    const yInvested = (point) => top + innerHeight - point.invested / maxValue * innerHeight;
    const valuePath = linePath(data, x, y);
    const investedPath = linePath(data, x, yInvested);
    const areaPath = data.length ? `${valuePath} L ${x(data[data.length - 1]).toFixed(2)} ${(top + innerHeight).toFixed(2)} L ${x(data[0]).toFixed(2)} ${(top + innerHeight).toFixed(2)} Z` : '';
    const grid = [0, .25, .5, .75, 1].map((ratio) => {
      const yy = top + innerHeight * ratio;
      const label = compactNumber(maxValue * (1 - ratio));
      return `<line class="chart-grid" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"></line><text class="chart-text" x="${left - 8}" y="${yy + 4}" text-anchor="end">${label}</text>`;
    }).join('');
    const yearStep = values.years > 20 ? 5 : values.years > 8 ? 2 : 1;
    const labels = data.filter((point) => point.year % yearStep === 0 || point.year === values.years).map((point) => `<text class="chart-text" x="${x(point)}" y="${height - 8}" text-anchor="middle">${point.year}年</text>`).join('');
    $('projectionChart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="定投预测路径图">
      <defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f9b78" stop-opacity=".28"></stop><stop offset="1" stop-color="#4f9b78" stop-opacity=".02"></stop></linearGradient></defs>
      ${grid}<path class="chart-area" d="${areaPath}"></path><path class="chart-line" d="${valuePath}"></path><path d="${investedPath}" fill="none" stroke="#bdc7bf" stroke-width="2" stroke-dasharray="5 5"></path>${labels}
    </svg>`;
  }

  function loadDrawdown(key) {
    const preset = drawdownPresets[key];
    $('drawdownIndex').value = key;
    $('drawdownHigh').value = Number(preset.high.toFixed(4));
    $('drawdownCurrent').value = Number(preset.current.toFixed(4));
    renderDrawdown();
  }

  function renderDrawdown() {
    const high = Number($('drawdownHigh').value) || 0;
    const current = Number($('drawdownCurrent').value) || 0;
    const result = Calc.drawdownLevels(high, current, reserveBudget());
    $('reserveBadge').textContent = `${plan().name}储备 ${money(reserveBudget())}`;
    if (result.currentDrawdown === null || current <= 0) {
      $('drawdownSummary').textContent = '请输入有效的参考高点和当前点位。';
      $('drawdownBody').innerHTML = emptyRow(4, '等待输入');
      return;
    }
    const drawdownText = percent(result.currentDrawdown);
    $('drawdownSummary').textContent = result.next
      ? `当前回撤 ${drawdownText}。下一档为 -${result.next.level * 100}%，触发点位 ${result.next.trigger.toFixed(2)}。达到档位不等于确认见底。`
      : `当前回撤 ${drawdownText}。四档条件均已达到，请核对历史执行记录，不要重复买入。`;
    $('drawdownBody').innerHTML = result.rows.map((row) => {
      const isNext = result.next && result.next.level === row.level;
      const status = row.triggered ? '已触及' : isNext ? '下一档' : '等待';
      return `<tr class="${row.triggered ? 'trigger-row triggered' : ''}"><td><strong>-${row.level * 100}%</strong></td><td class="number">${row.trigger.toFixed(2)}</td><td class="number">${money(row.amount)}</td><td><span class="badge ${row.triggered ? '' : 'gray'}">${status}</span></td></tr>`;
    }).join('');
  }

  function loadRebalance() {
    const values = plan().rebalance;
    $('rebalanceEquity').value = values.equity;
    $('rebalanceCash').value = values.cash;
    $('rebalanceTarget').value = values.target;
    renderRebalance();
  }

  function renderRebalance() {
    const values = {
      equity: Number($('rebalanceEquity').value) || 0,
      cash: Number($('rebalanceCash').value) || 0,
      target: Math.min(100, Math.max(0, Number($('rebalanceTarget').value) || 0)),
    };
    plan().rebalance = values;
    const result = Calc.rebalance(values.equity, values.cash, values.target);
    $('rebalanceResult').textContent = Math.abs(result.adjustment) < 0.005
      ? '无需调整'
      : `${result.adjustment > 0 ? '买入权益' : '卖出权益'} ${money(Math.abs(result.adjustment))}`;
    $('rebalanceDetail').textContent = `调整后权益 ${money(result.targetEquity)} · 账户合计 ${money(result.total)}`;
    saveState();
  }

  function setTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === `page-${tab}`));
    saveState();
  }

  function setActivePlan(nextPlan, preserveDrawdown = false) {
    state.activePlan = nextPlan;
    document.querySelectorAll('[data-plan]').forEach((button) => button.classList.toggle('active', button.dataset.plan === nextPlan));
    $('planDescription').textContent = plan().description;
    $('planCurrency').textContent = plan().currency;
    $('planBudgetLabel').textContent = `预算 ${money(plan().total, 0)} · ${plan().months} 个月`;
    resetForm();
    loadProjection();
    loadRebalance();
    if (!preserveDrawdown) loadDrawdown(nextPlan === 'cn' ? 'csi' : 'sp');
    renderAll();
    saveState();
  }

  function renderAll() {
    renderOverview();
    renderTransactions();
    renderDrawdown();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `定投备份-${today()}.json`);
    toast('JSON 备份已导出');
  }

  function exportCsv() {
    const header = ['日期', '计划', '标的', '代码', '类型', '用途', '成交金额', '份额', '费用', '币种', '备注'];
    const rows = planTransactions().map((tx) => {
      const asset = assetById(tx.assetId);
      return [tx.date, plan().name, asset?.name || tx.assetId, asset?.ticker || '', typeLabels[tx.type], purposeLabels[tx.purpose] || '', tx.amount, tx.quantity, tx.fee || 0, plan().currency, tx.note || ''];
    });
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadBlob(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), `${plan().name}-交易记录-${today()}.csv`);
    toast('CSV 已导出');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJsonFile(file) {
    try {
      const imported = normalizeState(JSON.parse(await file.text()));
      if (!window.confirm('恢复备份会替换当前全部本地数据，是否继续？')) return;
      state = imported;
      saveState();
      setActivePlan(state.activePlan);
      setTab(state.activeTab);
      toast('备份已恢复');
    } catch (error) {
      toast(`导入失败：${error.message}`);
    } finally {
      $('importFile').value = '';
    }
  }

  document.querySelectorAll('[data-plan]').forEach((button) => button.addEventListener('click', () => setActivePlan(button.dataset.plan)));
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.go)));
  $('quickAdd').addEventListener('click', () => { resetForm(); setTab('transactions'); $('txDate').focus(); });
  $('positionsBody').addEventListener('change', (event) => {
    if (!event.target.matches('.price-input')) return;
    const asset = assetById(event.target.dataset.asset);
    if (!asset) return;
    asset.price = Math.max(0, Number(event.target.value) || 0);
    asset.priceDate = today();
    saveState();
    renderOverview();
    toast('价格已更新');
  });
  $('transactionsBody').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-delete]');
    if (edit) editTransaction(edit.dataset.edit);
    if (remove) deleteTransaction(remove.dataset.delete);
  });
  $('transactionForm').addEventListener('submit', submitTransaction);
  $('cancelEdit').addEventListener('click', resetForm);
  $('txType').addEventListener('change', () => { updateFormType(); updateCalculatedPrice(); });
  $('txAsset').addEventListener('change', () => $('customAssetFields').classList.toggle('hidden', $('txAsset').value !== '__new__'));
  ['txAmount', 'txQuantity'].forEach((id) => $(id).addEventListener('input', updateCalculatedPrice));
  ['projectionInitial', 'projectionMonthly', 'projectionYears', 'projectionLow', 'projectionBase', 'projectionHigh'].forEach((id) => $(id).addEventListener('input', renderProjection));
  $('usePlanProjection').addEventListener('click', () => {
    plan().projection = { ...plan().projection, initial: 0, monthly: Number(monthlyBudget().toFixed(2)), years: plan().months / 12 };
    loadProjection();
    toast('已填入当前计划的基础定投参数');
  });
  $('drawdownIndex').addEventListener('change', () => {
    const key = $('drawdownIndex').value;
    const desiredPlan = key === 'csi' ? 'cn' : 'us';
    if (state.activePlan !== desiredPlan) setActivePlan(desiredPlan, true);
    loadDrawdown(key);
  });
  ['drawdownHigh', 'drawdownCurrent'].forEach((id) => $(id).addEventListener('input', renderDrawdown));
  $('resetDrawdown').addEventListener('click', () => loadDrawdown($('drawdownIndex').value));
  ['rebalanceEquity', 'rebalanceCash', 'rebalanceTarget'].forEach((id) => $(id).addEventListener('input', renderRebalance));
  $('exportJson').addEventListener('click', exportJson);
  $('exportCsv').addEventListener('click', exportCsv);
  $('importJson').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', () => { if ($('importFile').files[0]) importJsonFile($('importFile').files[0]); });
  $('resetData').addEventListener('click', () => $('resetDialog').showModal());
  $('cancelReset').addEventListener('click', () => $('resetDialog').close());
  $('confirmReset').addEventListener('click', () => {
    state = defaultState();
    saveState();
    $('resetDialog').close();
    setActivePlan('us');
    setTab('overview');
    toast('本地数据已清空');
  });

  setActivePlan(state.activePlan);
  setTab(state.activeTab);
})();
