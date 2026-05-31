const STORAGE_KEY = "calc-decaissement-settings-v1";
const SVG_NS = "http://www.w3.org/2000/svg";

const defaultSettings = {
  target: {
    startDate: "2035-01-01",
    annualAmount: 60000,
    durationYears: 25,
    changes: []
  },
  sources: [
    {
      id: crypto.randomUUID(),
      type: "investment",
      name: "REER",
      annualIncomeAmount: 0,
      initialAmount: 280000,
      initialDate: "2026-01-01",
      color: "#1f7a8c",
      contributionAmount: 600,
      contributionPeriod: "biweekly",
      withdrawalStartDate: "2035-01-01",
      annualReturnRate: 4.5,
      endDate: "2059-12-31",
      constantWithdrawal: false
    },
    {
      id: crypto.randomUUID(),
      type: "investment",
      name: "CELI",
      annualIncomeAmount: 0,
      initialAmount: 85000,
      initialDate: "2026-01-01",
      color: "#d95f43",
      contributionAmount: 500,
      contributionPeriod: "monthly",
      withdrawalStartDate: "2035-01-01",
      annualReturnRate: 4,
      endDate: "2059-12-31",
      constantWithdrawal: true
    }
  ]
};

const fields = {
  targetStartDate: document.querySelector("#targetStartDate"),
  targetAnnualAmount: document.querySelector("#targetAnnualAmount"),
  targetDurationYears: document.querySelector("#targetDurationYears"),
  targetChangesList: document.querySelector("#targetChangesList"),
  addTargetChange: document.querySelector("#addTargetChange"),
  targetChangeTemplate: document.querySelector("#targetChangeTemplate"),
  sourcesList: document.querySelector("#sourcesList"),
  addSource: document.querySelector("#addSource"),
  resetSettings: document.querySelector("#resetSettings"),
  sourceTemplate: document.querySelector("#sourceTemplate"),
  storageStatus: document.querySelector("#storageStatus"),
  summaryStrip: document.querySelector("#summaryStrip"),
  legend: document.querySelector("#legend"),
  chart: document.querySelector("#chart"),
  scheduleHead: document.querySelector("#scheduleHead"),
  scheduleBody: document.querySelector("#scheduleBody")
};

let settings = loadSettings();
let saveTimer = 0;

init();

function init() {
  requestPersistentStorage();
  bindTargetFields();
  renderAll();

  fields.addSource.addEventListener("click", () => {
    settings.sources.push(createSource());
    updateAndRender();
  });

  fields.addTargetChange.addEventListener("click", () => {
    settings.target.changes.push(createTargetChange());
    updateAndRender();
  });

  fields.resetSettings.addEventListener("click", () => {
    const confirmed = globalThis.confirm("Reinitialiser la configuration? Les parametres sauvegardes seront remplaces.");
    if (!confirmed) return;
    settings = structuredClone(defaultSettings);
    settings.sources = settings.sources.map((source) => ({ ...source, id: crypto.randomUUID() }));
    updateAndRender();
  });
}

function bindTargetFields() {
  fields.targetStartDate.addEventListener("input", (event) => {
    settings.target.startDate = event.target.value;
    updateProjection();
  });

  fields.targetAnnualAmount.addEventListener("input", (event) => {
    settings.target.annualAmount = numberValue(event.target.value);
    updateProjection();
  });

  fields.targetDurationYears.addEventListener("input", (event) => {
    settings.target.durationYears = Math.max(1, Math.round(numberValue(event.target.value)));
    updateProjection();
  });
}

function renderAll() {
  renderTargetFields();
  renderTargetChanges();
  renderSources();
  renderProjection();
}

function renderProjection() {
  const schedule = buildSchedule(settings);
  renderSummary(schedule);
  renderLegend(settings.sources);
  renderChart(schedule, settings);
  renderTable(schedule, settings.sources);
}

function renderTargetFields() {
  fields.targetStartDate.value = settings.target.startDate;
  fields.targetAnnualAmount.value = settings.target.annualAmount;
  fields.targetDurationYears.value = settings.target.durationYears;
}

function renderTargetChanges() {
  fields.targetChangesList.replaceChildren();

  const changes = sortedTargetChanges(settings.target.changes);
  changes.forEach((change) => {
    const node = fields.targetChangeTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.targetChangeId = change.id;

    node.querySelectorAll("[data-target-change-field]").forEach((input) => {
      const key = input.dataset.targetChangeField;
      input.value = change[key];
      input.addEventListener("input", () => updateTargetChangeValue(change.id, key, input));
    });

    node.querySelector(".remove-target-change").addEventListener("click", () => {
      settings.target.changes = settings.target.changes.filter((item) => item.id !== change.id);
      updateAndRender();
    });

    fields.targetChangesList.append(node);
  });
}

function renderSources() {
  fields.sourcesList.replaceChildren();

  if (!settings.sources.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Aucune source configuree.";
    fields.sourcesList.append(empty);
    return;
  }

  settings.sources.forEach((source) => {
    const node = fields.sourceTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.sourceId = source.id;
    node.dataset.sourceType = source.type;
    updateSourceLabels(node, source.type);

    node.querySelectorAll("[data-field]").forEach((input) => {
      const key = input.dataset.field;
      if (input.type === "checkbox") {
        input.checked = Boolean(source[key]);
      } else {
        input.value = source[key];
      }

      input.addEventListener("input", () => {
        updateSourceValue(source.id, key, input);
      });
    });

    node.querySelector(".remove-source").addEventListener("click", () => {
      settings.sources = settings.sources.filter((item) => item.id !== source.id);
      updateAndRender();
    });

    fields.sourcesList.append(node);
  });
}

function updateSourceValue(sourceId, key, input) {
  const source = settings.sources.find((item) => item.id === sourceId);
  if (!source) return;

  if (input.type === "checkbox") {
    source[key] = input.checked;
  } else if (input.type === "number") {
    source[key] = numberValue(input.value);
  } else {
    source[key] = input.value;
  }

  if (key === "type") {
    updateAndRender();
    return;
  }

  updateProjection();
}

function updateTargetChangeValue(changeId, key, input) {
  const change = settings.target.changes.find((item) => item.id === changeId);
  if (!change) return;

  change[key] = input.type === "number" ? numberValue(input.value) : input.value;
  updateProjection();
}

function updateAndRender() {
  scheduleSave();
  renderAll();
}

function updateProjection() {
  scheduleSave();
  renderProjection();
}

function createSource() {
  const color = nextColor(settings.sources.length);
  return {
    id: crypto.randomUUID(),
    type: "investment",
    name: `Source ${settings.sources.length + 1}`,
    annualIncomeAmount: 0,
    initialAmount: 0,
    initialDate: settings.target.startDate,
    color,
    contributionAmount: 0,
    contributionPeriod: "monthly",
    withdrawalStartDate: settings.target.startDate,
    annualReturnRate: 4,
    endDate: endOfTarget(settings.target),
    constantWithdrawal: false
  };
}

function createTargetChange() {
  const lastChange = sortedTargetChanges(settings.target.changes).at(-1);
  const start = parseDate(lastChange?.startDate || settings.target.startDate) ?? new Date();
  start.setFullYear(start.getFullYear() + 1);

  return {
    id: crypto.randomUUID(),
    startDate: toDateInputValue(start),
    annualAmount: settings.target.annualAmount
  };
}

function buildSchedule(currentSettings) {
  const targetStart = parseDate(currentSettings.target.startDate) ?? new Date();
  const durationYears = Math.max(1, Math.round(numberValue(currentSettings.target.durationYears)));
  const activeSources = currentSettings.sources.map((source) => ({
    ...source,
    balance: isAnnualIncomeSource(source) ? 0 : projectBalanceToDate(source, targetStart),
    initialAmountApplied: isAnnualIncomeSource(source) ? true : isInitialAmountApplied(source, targetStart)
  }));

  return Array.from({ length: durationYears }, (_, index) => {
    const yearDate = new Date(targetStart);
    yearDate.setFullYear(targetStart.getFullYear() + index);
    const nextYear = new Date(yearDate);
    nextYear.setFullYear(yearDate.getFullYear() + 1);
    const year = yearDate.getFullYear();
    const withdrawals = new Map();
    const targetAmount = targetAmountForDate(currentSettings.target, yearDate);

    activeSources.forEach((source) => withdrawals.set(source.id, 0));

    activeSources.forEach((source) => {
      if (isAnnualIncomeSource(source)) return;
      applyFutureInitialAmount(source, yearDate, nextYear);
    });

    activeSources.forEach((source) => {
      if (!isAnnualIncomeSource(source)) return;
      const amount = annualIncomeForYear(source, yearDate);
      if (amount > 0) withdrawals.set(source.id, amount);
    });

    activeSources.forEach((source) => {
      if (isAnnualIncomeSource(source) || !source.constantWithdrawal || !canWithdraw(source, yearDate)) return;
      const amount = constantWithdrawalAmount(source, yearDate);
      withdrawFromSource(source, amount, withdrawals);
    });

    let remainingTarget = Math.max(0, targetAmount - totalWithdrawals(withdrawals));
    activeSources.forEach((source) => {
      if (isAnnualIncomeSource(source) || source.constantWithdrawal || !canWithdraw(source, yearDate) || remainingTarget <= 0) return;
      const amount = Math.min(source.balance, remainingTarget);
      withdrawFromSource(source, amount, withdrawals);
      remainingTarget -= amount;
    });

    activeSources.forEach((source) => {
      if (isAnnualIncomeSource(source)) return;
      const endDate = parseDate(source.endDate);
      if (endDate && endDate < yearDate) {
        source.balance = 0;
        return;
      }
      source.balance = growOneYear(source.balance, source.annualReturnRate, endDate && endDate < nextYear ? monthsBetween(yearDate, endDate) / 12 : 1);
    });

    const sourceValues = activeSources.map((source) => ({
      id: source.id,
      name: source.name,
      color: source.color,
      amount: roundCurrency(withdrawals.get(source.id) ?? 0),
      endingBalance: roundCurrency(source.balance)
    }));

    return {
      year,
      target: targetAmount,
      total: roundCurrency(sourceValues.reduce((sum, item) => sum + item.amount, 0)),
      sourceValues
    };
  });
}

function projectBalanceToDate(source, targetDate) {
  if (isAnnualIncomeSource(source)) return 0;

  const initialDate = parseDate(source.initialDate);
  if (!initialDate || initialDate > targetDate) return 0;

  const withdrawalStart = parseDate(source.withdrawalStartDate) ?? targetDate;
  const endDate = parseDate(source.endDate);
  let balance = Math.max(0, numberValue(source.initialAmount));
  const monthlyReturn = Math.pow(1 + numberValue(source.annualReturnRate) / 100, 1 / 12) - 1;
  const monthlyContribution = contributionAnnualAmount(source) / 12;
  const totalMonths = Math.max(0, (targetDate.getFullYear() - initialDate.getFullYear()) * 12 + targetDate.getMonth() - initialDate.getMonth());

  for (let monthIndex = 0; monthIndex < totalMonths; monthIndex += 1) {
    const cursor = new Date(initialDate);
    cursor.setMonth(initialDate.getMonth() + monthIndex);
    if (cursor < withdrawalStart && (!endDate || cursor <= endDate)) {
      balance += monthlyContribution;
    }
    balance *= 1 + monthlyReturn;
  }

  return Math.max(0, balance);
}

function isInitialAmountApplied(source, targetDate) {
  const initialDate = parseDate(source.initialDate);
  return !initialDate || initialDate <= targetDate;
}

function applyFutureInitialAmount(source, yearDate, nextYear) {
  if (source.initialAmountApplied) return;

  const initialDate = parseDate(source.initialDate);
  if (!initialDate || initialDate >= nextYear) return;

  source.balance += Math.max(0, numberValue(source.initialAmount));
  source.initialAmountApplied = true;
}

function canWithdraw(source, yearDate) {
  const start = parseDate(source.withdrawalStartDate);
  const end = parseDate(source.endDate);
  if (start && yearDate < start) return false;
  if (end && yearDate > end) return false;
  return source.balance > 0;
}

function constantWithdrawalAmount(source, yearDate) {
  const end = parseDate(source.endDate);
  const yearsLeft = Math.max(1, end ? Math.ceil(monthsBetween(yearDate, end) / 12) : 1);
  const rate = numberValue(source.annualReturnRate) / 100;

  if (rate === 0) return source.balance / yearsLeft;
  return source.balance * (rate / (1 - Math.pow(1 + rate, -yearsLeft)));
}

function withdrawFromSource(source, amount, withdrawals) {
  const actual = Math.min(Math.max(0, amount), source.balance);
  source.balance = Math.max(0, source.balance - actual);
  withdrawals.set(source.id, (withdrawals.get(source.id) ?? 0) + actual);
}

function growOneYear(balance, annualReturnRate, fractionOfYear) {
  const rate = numberValue(annualReturnRate) / 100;
  return Math.max(0, balance * Math.pow(1 + rate, Math.max(0, fractionOfYear)));
}

function renderSummary(schedule) {
  const totalWithdrawn = schedule.reduce((sum, year) => sum + year.total, 0);
  const targetTotal = schedule.reduce((sum, year) => sum + year.target, 0);
  const firstShortfall = schedule.find((year) => year.total + 0.01 < year.target);
  const surplus = Math.max(0, totalWithdrawn - targetTotal);
  const shortfall = Math.max(0, targetTotal - totalWithdrawn);
  const sourceCount = settings.sources.length;
  let statusLabel = "Equilibre";
  let statusValue = "Aucun ecart";
  let statusTone = "neutral";

  if (firstShortfall) {
    statusLabel = "Deficit";
    statusValue = `${currency(shortfall)} des ${firstShortfall.year}`;
    statusTone = "negative";
  } else if (surplus > 0) {
    statusLabel = "Surplus";
    statusValue = currency(surplus);
    statusTone = "positive";
  }

  fields.summaryStrip.replaceChildren(
    summaryItem("Sources", sourceCount.toLocaleString("fr-CA")),
    summaryItem("Cible totale", currency(targetTotal)),
    summaryItem("Total projete", currency(totalWithdrawn)),
    summaryItem(statusLabel, statusValue, statusTone)
  );
}

function summaryItem(label, value, tone = "neutral") {
  const item = document.createElement("div");
  item.className = `summary-item summary-item-${tone}`;
  item.innerHTML = `<span class="summary-label"></span><span class="summary-value"></span>`;
  item.querySelector(".summary-label").textContent = label;
  item.querySelector(".summary-value").textContent = value;
  return item;
}

function renderLegend(sources) {
  fields.legend.replaceChildren();
  sources.forEach((source) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = source.color;
    const label = document.createElement("span");
    label.textContent = source.name;
    item.append(swatch, label);
    fields.legend.append(item);
  });
}

function renderChart(schedule, currentSettings) {
  const svg = fields.chart;
  svg.replaceChildren();

  const width = Math.max(720, schedule.length * 64 + 120);
  const height = 460;
  const margin = { top: 32, right: 28, bottom: 52, left: 86 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxTotal = Math.max(...schedule.map((year) => Math.max(year.total, year.target)), 1);
  const yMax = niceMax(maxTotal * 1.12);
  const barGap = 14;
  const barWidth = Math.max(26, chartWidth / schedule.length - barGap);
  const yearSlotWidth = chartWidth / schedule.length;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-label", "Decaissements annuels par source");

  for (let step = 0; step <= 4; step += 1) {
    const value = (yMax / 4) * step;
    const y = margin.top + chartHeight - (value / yMax) * chartHeight;
    line(svg, margin.left, y, width - margin.right, y, "grid-line");
    text(svg, margin.left - 10, y + 4, compactCurrency(value), "axis-label", "end");
  }

  line(svg, margin.left, margin.top, margin.left, margin.top + chartHeight, "axis-line");
  line(svg, margin.left, margin.top + chartHeight, width - margin.right, margin.top + chartHeight, "axis-line");

  renderTargetLine(svg, schedule, margin, chartHeight, yearSlotWidth, yMax);

  schedule.forEach((year, index) => {
    const x = margin.left + index * yearSlotWidth + barGap / 2;
    let yCursor = margin.top + chartHeight;

    year.sourceValues.forEach((sourceValue) => {
      if (sourceValue.amount <= 0) return;
      const segmentHeight = (sourceValue.amount / yMax) * chartHeight;
      yCursor -= segmentHeight;
      rect(svg, x, yCursor, barWidth, segmentHeight, sourceValue.color);
    });

    text(svg, x + barWidth / 2, margin.top + chartHeight + 24, String(year.year), "axis-label", "middle");
    if (year.total > 0) {
      const totalY = margin.top + chartHeight - (year.total / yMax) * chartHeight;
      text(svg, x + barWidth / 2, Math.max(14, totalY - 8), compactCurrency(year.total), "bar-label", "middle");
    }
  });
}

function renderTable(schedule, sources) {
  fields.scheduleHead.replaceChildren();
  fields.scheduleBody.replaceChildren();

  const headRow = document.createElement("tr");
  ["Annee", ...sources.map((source) => source.name), "Total", "Cible"].forEach((title) => {
    const th = document.createElement("th");
    th.textContent = title;
    headRow.append(th);
  });
  fields.scheduleHead.append(headRow);

  schedule.forEach((year) => {
    const row = document.createElement("tr");
    const yearCell = document.createElement("td");
    yearCell.textContent = year.year;
    row.append(yearCell);

    sources.forEach((source) => {
      const value = year.sourceValues.find((item) => item.id === source.id)?.amount ?? 0;
      const cell = document.createElement("td");
      cell.textContent = currency(value);
      row.append(cell);
    });

    const totalCell = document.createElement("td");
    totalCell.textContent = currency(year.total);
    row.append(totalCell);

    const targetCell = document.createElement("td");
    targetCell.textContent = currency(year.target);
    row.append(targetCell);

    fields.scheduleBody.append(row);
  });
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultSettings);
    const parsed = JSON.parse(raw);
    return normalizeSettings(parsed);
  } catch {
    return structuredClone(defaultSettings);
  }
}

function normalizeSettings(value) {
  return {
    target: {
      startDate: value?.target?.startDate || defaultSettings.target.startDate,
      annualAmount: numberValue(value?.target?.annualAmount || defaultSettings.target.annualAmount),
      durationYears: Math.max(1, Math.round(numberValue(value?.target?.durationYears || defaultSettings.target.durationYears))),
      changes: normalizeTargetChanges(value?.target?.changes)
    },
    sources: Array.isArray(value?.sources) ? value.sources.map((source, index) => ({
      id: source.id || crypto.randomUUID(),
      type: source.type === "annualIncome" ? "annualIncome" : "investment",
      name: source.name || `Source ${index + 1}`,
      annualIncomeAmount: numberValue(source.annualIncomeAmount),
      initialAmount: numberValue(source.initialAmount),
      initialDate: source.initialDate || defaultSettings.target.startDate,
      color: source.color || nextColor(index),
      contributionAmount: numberValue(source.contributionAmount),
      contributionPeriod: source.contributionPeriod || "monthly",
      withdrawalStartDate: source.withdrawalStartDate || defaultSettings.target.startDate,
      annualReturnRate: numberValue(source.annualReturnRate),
      endDate: source.endDate || endOfTarget(value?.target || defaultSettings.target),
      constantWithdrawal: Boolean(source.constantWithdrawal)
    })) : []
  };
}

function scheduleSave() {
  globalThis.clearTimeout(saveTimer);
  saveTimer = globalThis.setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    fields.storageStatus.textContent = "Parametres sauvegardes dans le navigateur";
  }, 120);
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;

  try {
    const alreadyPersistent = await navigator.storage.persisted();
    const isPersistent = alreadyPersistent || await navigator.storage.persist();
    fields.storageStatus.textContent = isPersistent
      ? "Stockage navigateur persistant actif"
      : "Parametres sauvegardes dans le navigateur";
  } catch {
    fields.storageStatus.textContent = "Parametres sauvegardes dans le navigateur";
  }
}

function contributionAnnualAmount(source) {
  const periods = {
    weekly: 52,
    biweekly: 26,
    monthly: 12,
    yearly: 1
  };
  return numberValue(source.contributionAmount) * (periods[source.contributionPeriod] ?? 12);
}

function isAnnualIncomeSource(source) {
  return source.type === "annualIncome";
}

function annualIncomeForYear(source, yearDate) {
  const start = parseDate(source.withdrawalStartDate);
  const end = parseDate(source.endDate);
  let activeMonths = 0;

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const cursor = new Date(yearDate);
    cursor.setMonth(yearDate.getMonth() + monthIndex, 1);
    if (start && cursor < firstDayOfMonth(start)) continue;
    if (end && cursor > firstDayOfMonth(end)) continue;
    activeMonths += 1;
  }

  return Math.max(0, numberValue(source.annualIncomeAmount)) * (activeMonths / 12);
}

function updateSourceLabels(node, type) {
  const startDateLabel = node.querySelector('[data-role="start-date-label"]');
  if (startDateLabel) {
    startDateLabel.textContent = type === "annualIncome" ? "Date de debut" : "Debut retraits";
  }
}

function firstDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfTarget(target) {
  const start = parseDate(target.startDate) ?? new Date();
  const end = new Date(start);
  end.setFullYear(start.getFullYear() + Math.max(1, Math.round(numberValue(target.durationYears))) - 1);
  end.setMonth(11, 31);
  return toDateInputValue(end);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthsBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function currency(value) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0
  }).format(value);
}

function compactCurrency(value) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function niceMax(value) {
  const exponent = Math.floor(Math.log10(value));
  const magnitude = Math.pow(10, exponent);
  return Math.ceil(value / magnitude) * magnitude;
}

function totalWithdrawals(withdrawals) {
  return Array.from(withdrawals.values()).reduce((sum, amount) => sum + amount, 0);
}

function nextColor(index) {
  const palette = ["#1f7a8c", "#d95f43", "#6f8f3d", "#8b5fbf", "#c58b22", "#2d6cdf", "#b13f72", "#4f7f7a"];
  return palette[index % palette.length];
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rect(svg, x, y, width, height, fill) {
  const element = document.createElementNS(SVG_NS, "rect");
  element.setAttribute("x", x);
  element.setAttribute("y", y);
  element.setAttribute("width", width);
  element.setAttribute("height", Math.max(0, height));
  element.setAttribute("rx", 4);
  element.setAttribute("fill", fill);
  svg.append(element);
}

function line(svg, x1, y1, x2, y2, className) {
  const element = document.createElementNS(SVG_NS, "line");
  element.setAttribute("x1", x1);
  element.setAttribute("y1", y1);
  element.setAttribute("x2", x2);
  element.setAttribute("y2", y2);
  element.setAttribute("class", className);
  svg.append(element);
}

function text(svg, x, y, content, className, anchor = "start") {
  const element = document.createElementNS(SVG_NS, "text");
  element.setAttribute("x", x);
  element.setAttribute("y", y);
  element.setAttribute("class", className);
  element.setAttribute("text-anchor", anchor);
  element.textContent = content;
  svg.append(element);
}
