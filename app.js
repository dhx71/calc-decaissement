const STORAGE_KEY_V2 = "calc-decaissement-scenarios-v2";
const STORAGE_KEY_V1 = "calc-decaissement-settings-v1";
const SVG_NS = "http://www.w3.org/2000/svg";

const defaultSettings = {
  inflationRate: 2,
  showConstantDollars: true,
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
      collapsed: false,
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
      constantWithdrawal: false,
      enabled: true
    },
    {
      id: crypto.randomUUID(),
      type: "investment",
      collapsed: false,
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
      constantWithdrawal: true,
      enabled: true
    }
  ]
};

const fields = {
  scenariosList: document.querySelector("#scenariosList"),
  addScenario: document.querySelector("#addScenario"),
  scenarioBodyTemplate: document.querySelector("#scenarioBodyTemplate"),
  targetChangeTemplate: document.querySelector("#targetChangeTemplate"),
  sourceTemplate: document.querySelector("#sourceTemplate"),
  storageStatus: document.querySelector("#storageStatus"),
  summaryStrip: document.querySelector("#summaryStrip"),
  legend: document.querySelector("#legend"),
  chart: document.querySelector("#chart"),
  avoirNetteChart: document.querySelector("#avoirNetteChart"),
  avoirNetteLegend: document.querySelector("#avoirNetteLegend"),
  scheduleHead: document.querySelector("#scheduleHead"),
  scheduleBody: document.querySelector("#scheduleBody")
};

let state = loadState();
let saveTimer = 0;

Object.defineProperty(globalThis, "settings", {
  get() {
    const active = state.scenarios.find((item) => item.id === state.activeScenarioId);
    return active ? active.settings : null;
  }
});

init();

function init() {
  requestPersistentStorage();
  const loadedFromUrl = loadScenarioFromUrl();
  renderAll();
  if (loadedFromUrl) {
    scheduleSave();
  }

  fields.addScenario.addEventListener("click", () => {
    state.scenarios.push(createScenario());
    state.activeScenarioId = state.scenarios.at(-1).id;
    updateAndRender();
  });
}

function renderAll() {
  renderScenarios();
  renderActiveScenarioBody();
  renderProjection();
}

function renderProjection() {
  const schedule = buildSchedule(settings);
  renderSummary(schedule);
  renderLegend(settings.sources);
  renderChart(schedule, settings);
  renderAvoirNetteChart(schedule, settings);
  renderTable(schedule, settings.sources);
}

function renderScenarios() {
  fields.scenariosList.replaceChildren();

  if (!state.scenarios.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Aucun scenario configure.";
    fields.scenariosList.append(empty);
    return;
  }

  state.scenarios.forEach((scenario, index) => {
    const isActive = scenario.id === state.activeScenarioId;
    const details = document.createElement("details");
    details.className = "scenario";
    details.dataset.scenarioId = scenario.id;
    details.open = isActive;

    const summary = document.createElement("summary");
    summary.className = "scenario-summary";

    const header = document.createElement("div");
    header.className = "scenario-header";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "scenario-name-input";
    nameInput.value = scenario.name;
    nameInput.maxLength = 60;
    nameInput.addEventListener("input", (event) => {
      scenario.name = event.target.value || "Sans nom";
      scheduleSave();
    });
    nameInput.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const actions = document.createElement("div");
    actions.className = "scenario-actions";

    const cloneButton = document.createElement("button");
    cloneButton.className = "icon-button";
    cloneButton.type = "button";
    cloneButton.title = "Cloner ce scenario";
    cloneButton.innerHTML = '<span aria-hidden="true">+</span>';
    cloneButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const cloned = cloneScenario(scenario);
      state.scenarios.splice(index + 1, 0, cloned);
      state.activeScenarioId = cloned.id;
      updateAndRender();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-button delete-scenario";
    deleteButton.type = "button";
    deleteButton.title = "Supprimer ce scenario";
    deleteButton.innerHTML = '<span aria-hidden="true">x</span>';
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.scenarios.length <= 1) {
        globalThis.alert("Vous devez avoir au moins un scenario.");
        return;
      }
      const confirmed = globalThis.confirm(`Supprimer le scenario "${scenario.name}"?`);
      if (!confirmed) return;
      state.scenarios = state.scenarios.filter((item) => item.id !== scenario.id);
      if (state.activeScenarioId === scenario.id) {
        state.activeScenarioId = state.scenarios[0].id;
      }
      updateAndRender();
    });

    actions.append(cloneButton, deleteButton);
    header.append(nameInput, actions);
    summary.append(header);
    details.append(summary);

    details.addEventListener("toggle", () => {
      if (details.open) {
        if (scenario.id !== state.activeScenarioId) {
          state.activeScenarioId = scenario.id;
          updateAndRender();
        }
      } else {
        details.open = true;
      }
    });

    fields.scenariosList.append(details);
  });
}

function renderActiveScenarioBody() {
  if (!settings) return;

  document.querySelectorAll(".scenario-body").forEach((el) => el.remove());

  const activeDetails = fields.scenariosList.querySelector(`.scenario[data-scenario-id="${state.activeScenarioId}"]`);
  if (!activeDetails) return;

  const body = fields.scenarioBodyTemplate.content.firstElementChild.cloneNode(true);

  bindScenarioToolbar(body);
  bindScenarioFields(body);
  renderTargetChangesInto(body, settings);
  renderSourcesInto(body, settings);

  activeDetails.append(body);
}

function bindScenarioToolbar(body) {
  const fileInput = body.querySelector(".import-file-input");

  body.querySelector(".copy-link-scenario").addEventListener("click", () => copyScenarioLink());
  body.querySelector(".export-scenario").addEventListener("click", () => exportScenarioToFile());
  body.querySelector(".import-scenario").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (event) => importScenarioFromFile(event, fileInput));

  body.querySelector(".reset-scenario").addEventListener("click", () => {
    const confirmed = globalThis.confirm("Reinitialiser la configuration? Les parametres sauvegardes seront remplaces.");
    if (!confirmed) return;
    const activeScenario = state.scenarios.find((item) => item.id === state.activeScenarioId);
    activeScenario.settings = structuredClone(defaultSettings);
    activeScenario.settings.sources = activeScenario.settings.sources.map((source) => ({
      ...source,
      id: crypto.randomUUID()
    }));
    updateAndRender();
  });
}

function bindScenarioFields(body) {
  const inflationRate = body.querySelector('[data-scenario-field="inflationRate"]');
  const showConstantDollars = body.querySelector('[data-scenario-field="showConstantDollars"]');
  const targetStartDate = body.querySelector('[data-scenario-field="targetStartDate"]');
  const targetAnnualAmount = body.querySelector('[data-scenario-field="targetAnnualAmount"]');
  const targetDurationYears = body.querySelector('[data-scenario-field="targetDurationYears"]');

  inflationRate.value = settings.inflationRate;
  showConstantDollars.checked = settings.showConstantDollars;

  inflationRate.addEventListener("input", (event) => {
    settings.inflationRate = numberValue(event.target.value);
    updateProjection();
  });

  showConstantDollars.addEventListener("change", (event) => {
    settings.showConstantDollars = event.target.checked;
    updateProjection();
  });

  targetStartDate.value = settings.target.startDate;
  targetStartDate.addEventListener("input", (event) => {
    settings.target.startDate = event.target.value;
    updateProjection();
  });

  targetAnnualAmount.value = settings.target.annualAmount;
  targetAnnualAmount.addEventListener("input", (event) => {
    settings.target.annualAmount = numberValue(event.target.value);
    updateProjection();
  });

  targetDurationYears.value = settings.target.durationYears;
  targetDurationYears.addEventListener("input", (event) => {
    settings.target.durationYears = Math.max(1, Math.round(numberValue(event.target.value)));
    updateProjection();
  });

  body.querySelector(".add-target-change").addEventListener("click", () => {
    settings.target.changes.push(createTargetChange());
    updateAndRender();
  });

  body.querySelector(".add-source").addEventListener("click", () => {
    settings.sources.push(createSource());
    updateAndRender();
  });
}

function renderTargetChangesInto(body, currentSettings) {
  const list = body.querySelector(".target-changes-list");
  list.replaceChildren();

  const changes = sortedTargetChanges(currentSettings.target.changes);
  changes.forEach((change) => {
    const node = fields.targetChangeTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.targetChangeId = change.id;

    node.querySelectorAll("[data-target-change-field]").forEach((input) => {
      const key = input.dataset.targetChangeField;
      input.value = change[key];
      input.addEventListener("input", () => updateTargetChangeValue(change.id, key, input));
      if (key === "startDate") {
        input.addEventListener("change", () => {
          const body = document.querySelector('.scenario-body');
          if (!body) return;
          const list = body.querySelector('.target-changes-list');
          if (!list) return;
          settings.target.changes = sortedTargetChanges(settings.target.changes);
          settings.target.changes.forEach((c) => {
            const el = list.querySelector(`[data-target-change-id="${c.id}"]`);
            if (el) list.appendChild(el);
          });
        });
      }
    });

    node.querySelector(".remove-target-change").addEventListener("click", () => {
      currentSettings.target.changes = currentSettings.target.changes.filter((item) => item.id !== change.id);
      updateAndRender();
    });

    list.append(node);
  });
}

function renderSourcesInto(body, currentSettings) {
  const list = body.querySelector(".sources-list");
  list.replaceChildren();

  if (!currentSettings.sources.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Aucune source configuree.";
    list.append(empty);
    return;
  }

  currentSettings.sources.forEach((source, index) => {
    const node = fields.sourceTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.sourceId = source.id;
    node.dataset.sourceType = source.type;
    node.dataset.collapsed = String(Boolean(source.collapsed));
    updateSourceLabels(node, source.type);
    updateSourceSummary(node, source);
    updateSourceCollapseState(node, source);

    node.querySelector(".source-summary-button").addEventListener("click", () => {
      toggleSourceCollapsed(source.id, node);
    });

    node.querySelectorAll("[data-field]").forEach((input) => {
      const key = input.dataset.field;
      if (input.type === "checkbox") {
        input.checked = Boolean(source[key]);
      } else {
        input.value = source[key];
      }

      input.addEventListener("input", () => {
        updateSourceValue(source.id, key, input);
        updateSourceSummary(node, source);
      });
    });

    const moveUpButton = node.querySelector(".move-source-up");
    const moveDownButton = node.querySelector(".move-source-down");
    moveUpButton.disabled = index === 0;
    moveDownButton.disabled = index === currentSettings.sources.length - 1;

    moveUpButton.addEventListener("click", () => moveSource(source.id, -1));
    moveDownButton.addEventListener("click", () => moveSource(source.id, 1));

    node.querySelector(".remove-source").addEventListener("click", () => {
      currentSettings.sources = currentSettings.sources.filter((item) => item.id !== source.id);
      updateAndRender();
    });

    list.append(node);
  });
}

function toggleSourceCollapsed(sourceId, node) {
  const source = settings.sources.find((item) => item.id === sourceId);
  if (!source) return;

  source.collapsed = !source.collapsed;
  updateSourceCollapseState(node, source);
  scheduleSave();
}

function updateSourceCollapseState(node, source) {
  const collapsed = Boolean(source.collapsed);
  const summaryButton = node.querySelector(".source-summary-button");
  const body = node.querySelector(".source-card-body");
  const icon = node.querySelector(".source-toggle-icon");

  node.dataset.collapsed = String(collapsed);
  summaryButton.setAttribute("aria-expanded", String(!collapsed));
  body.hidden = collapsed;
  icon.textContent = collapsed ? "▸" : "▾";
}

function updateSourceSummary(node, source) {
  node.querySelector(".source-summary-name").textContent = source.name || "Source sans nom";
  node.querySelector(".source-summary-color").style.background = source.color;
}

function moveSource(sourceId, direction) {
  const index = settings.sources.findIndex((source) => source.id === sourceId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= settings.sources.length) return;

  const movedSource = settings.sources[index];
  settings.sources.splice(index, 1);
  settings.sources.splice(nextIndex, 0, movedSource);
  updateAndRender();
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

  if (key === "startDate") {
    if (!parseDate(change.startDate)) return;
    settings.target.changes = sortedTargetChanges(settings.target.changes);
    updateProjection();
    return;
  }

  updateProjection();
}

function updateAndRender() {
  scheduleSave();
  renderAll();
}

function updateProjection() {
  scheduleSave();
  const activeElement = document.activeElement;
  const isTargetChangeDate = activeElement?.matches('[data-target-change-field="startDate"]');
  renderProjection();
  if (isTargetChangeDate && activeElement !== document.activeElement) {
    activeElement.focus();
  }
}

function createScenario() {
  return {
    id: crypto.randomUUID(),
    name: `Scenario ${state.scenarios.length + 1}`,
    settings: structuredClone(defaultSettings)
  };
}

function cloneScenario(source) {
  const clonedSettings = JSON.parse(JSON.stringify(source.settings));
  clonedSettings.sources.forEach((s) => { s.id = crypto.randomUUID(); });
  clonedSettings.target.changes.forEach((c) => { c.id = crypto.randomUUID(); });
  return {
    id: crypto.randomUUID(),
    name: `${source.name} (copie)`,
    settings: clonedSettings
  };
}

function createSource() {
  const color = nextColor(settings.sources.length);
  return {
    id: crypto.randomUUID(),
    type: "investment",
    collapsed: false,
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
    constantWithdrawal: false,
    enabled: true
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

function encodeScenario(settings) {
  const json = JSON.stringify(settings);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeScenarioData(base64) {
  const json = decodeURIComponent(escape(atob(base64)));
  return JSON.parse(json);
}

function getShareUrl(settings) {
  const base64 = encodeScenario(settings);
  const url = new URL(window.location.href);
  url.searchParams.set("s", base64);
  url.hash = "";
  return url.toString();
}

function copyScenarioLink() {
  const url = getShareUrl(settings);
  navigator.clipboard.writeText(url).then(() => {
    fields.storageStatus.textContent = "Lien copie dans le presse-papier";
  }).catch(() => {
    globalThis.alert("Impossible de copier le lien. Verifiez les permissions du navigateur.");
  });
}

function loadScenarioFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const base64 = params.get("s");
  if (!base64) return false;

  try {
    const loadedSettings = normalizeSettings(decodeScenarioData(base64));
    const id = crypto.randomUUID();
    const scenarioName = "Scenario partage";

    const duplicateIndex = state.scenarios.findIndex((s) => s.name === scenarioName);
    if (duplicateIndex !== -1) {
      const loadedJson = JSON.stringify(loadedSettings);
      const existingJson = JSON.stringify(state.scenarios[duplicateIndex].settings);
      if (loadedJson === existingJson) {
        state.activeScenarioId = state.scenarios[duplicateIndex].id;
        return true;
      }
    }

    state.scenarios.push({ id, name: "Scenario partage", settings: loadedSettings });
    state.activeScenarioId = id;
    return true;
  } catch {
    fields.storageStatus.textContent = "Lien de scenario invalide";
    return false;
  }
}

function exportScenarioToFile() {
  const json = JSON.stringify(settings, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "configuration-decaissements.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importScenarioFromFile(event, fileInput) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(reader.result);
      const activeScenario = state.scenarios.find((item) => item.id === state.activeScenarioId);
      activeScenario.settings = normalizeSettings(parsed);
      updateAndRender();
      fields.storageStatus.textContent = "Configuration importee et sauvegardee";
    } catch {
      globalThis.alert("Fichier invalide. Veuillez selectionner un fichier JSON valide.");
    }
  });
  reader.readAsText(file);
  fileInput.value = "";
}

function buildSchedule(currentSettings) {
  const targetStart = parseDate(currentSettings.target.startDate) ?? new Date();
  const durationYears = Math.max(1, Math.round(numberValue(currentSettings.target.durationYears)));
  const inflationRate = numberValue(currentSettings.inflationRate) / 100;
  const showConstant = currentSettings.showConstantDollars;

  const toReal = (nominalRate) =>
    ((1 + nominalRate / 100) / (1 + inflationRate) - 1) * 100;

  const activeSources = currentSettings.sources
    .filter((source) => source.enabled !== false)
    .map((source) => {
    const realReturnRate = toReal(numberValue(source.annualReturnRate));
    return {
      ...source,
      annualReturnRate: realReturnRate,
      balance: isAnnualIncomeSource(source) ? 0 : projectBalanceToDate({ ...source, annualReturnRate: realReturnRate }, targetStart),
      initialAmountApplied: isAnnualIncomeSource(source) ? true : isInitialAmountApplied(source, targetStart)
    };
  });

  const scheduleReal = Array.from({ length: durationYears }, (_, index) => {
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
      const amount = roundCurrency(annualIncomeForYear(source, yearDate));
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
      const fraction = endDate && endDate < nextYear ? monthsBetween(yearDate, endDate) / 12 : 1;
      source.balance = growOneYear(source.balance, source.annualReturnRate, fraction);
    });

    const sourceValues = activeSources.map((source) => ({
      id: source.id,
      name: source.name,
      color: source.color,
      amount: withdrawals.get(source.id) ?? 0,
      endingBalance: source.balance
    }));

    return {
      year,
      target: targetAmount,
      total: sourceValues.reduce((sum, item) => sum + item.amount, 0),
      sourceValues
    };
  });

  if (showConstant) {
    return scheduleReal.map((yearReal) => ({
      year: yearReal.year,
      target: roundCurrency(yearReal.target),
      total: roundCurrency(yearReal.total),
      sourceValues: yearReal.sourceValues.map((sv) => ({
        ...sv,
        amount: roundCurrency(sv.amount),
        endingBalance: roundCurrency(sv.endingBalance)
      }))
    }));
  }

  return scheduleReal.map((yearReal, index) => {
    const infMult = Math.pow(1 + inflationRate, index);
    return {
      year: yearReal.year,
      target: roundCurrency(yearReal.target * infMult),
      total: roundCurrency(yearReal.total * infMult),
      sourceValues: yearReal.sourceValues.map((sv) => ({
        ...sv,
        amount: roundCurrency(sv.amount * infMult),
        endingBalance: roundCurrency(sv.endingBalance * infMult)
      }))
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
  const firstShortfall = schedule.find((year) => Math.round(year.total * 100) + 1 < Math.round(year.target * 100));
  const remainingBalance = finalEndingBalance(schedule);
  const surplus = Math.max(0, totalWithdrawn - targetTotal) + remainingBalance;
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

function finalEndingBalance(schedule) {
  const lastYear = schedule.at(-1);
  if (!lastYear) return 0;

  return lastYear.sourceValues.reduce((sum, sourceValue) => sum + Math.max(0, sourceValue.endingBalance), 0);
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
    item.className = source.enabled !== false ? "legend-item" : "legend-item legend-item--disabled";
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
    const barTop = year.total > 0 ? margin.top + chartHeight - (year.total / yMax) * chartHeight : margin.top + chartHeight - 1;

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

    tooltipRect(svg, x, barTop, barWidth, margin.top + chartHeight - barTop, barTooltipText(year));
  });
}

function renderAvoirNetteChart(schedule, currentSettings) {
  const svg = fields.avoirNetteChart;
  svg.replaceChildren();

  const width = Math.max(720, schedule.length * 64 + 120);
  const height = 460;
  const margin = { top: 32, right: 28, bottom: 52, left: 86 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxTotal = Math.max(...schedule.map((year) =>
    year.sourceValues.reduce((sum, sv) => sum + (sv.endingBalance || 0), 0)
  ), 1);
  const yMax = niceMax(maxTotal * 1.12);
  const barGap = 14;
  const barWidth = Math.max(26, chartWidth / schedule.length - barGap);
  const yearSlotWidth = chartWidth / schedule.length;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-label", "Avoir nette annuel par source");

  renderAvoirNetteLegend(currentSettings.sources);

  for (let step = 0; step <= 4; step += 1) {
    const value = (yMax / 4) * step;
    const y = margin.top + chartHeight - (value / yMax) * chartHeight;
    line(svg, margin.left, y, width - margin.right, y, "grid-line");
    text(svg, margin.left - 10, y + 4, compactCurrency(value), "axis-label", "end");
  }

  line(svg, margin.left, margin.top, margin.left, margin.top + chartHeight, "axis-line");
  line(svg, margin.left, margin.top + chartHeight, width - margin.right, margin.top + chartHeight, "axis-line");

  schedule.forEach((year, index) => {
    const x = margin.left + index * yearSlotWidth + barGap / 2;
    let yCursor = margin.top + chartHeight;

    const totalBalance = year.sourceValues.reduce((sum, sv) => sum + (sv.endingBalance || 0), 0);
    const barTop = totalBalance > 0
      ? margin.top + chartHeight - (totalBalance / yMax) * chartHeight
      : margin.top + chartHeight - 1;

    year.sourceValues.forEach((sourceValue) => {
      const balance = sourceValue.endingBalance || 0;
      if (balance <= 0) return;
      const segmentHeight = (balance / yMax) * chartHeight;
      yCursor -= segmentHeight;
      rect(svg, x, yCursor, barWidth, segmentHeight, sourceValue.color);
    });

    text(svg, x + barWidth / 2, margin.top + chartHeight + 24, String(year.year), "axis-label", "middle");
    if (totalBalance > 0) {
      const totalY = margin.top + chartHeight - (totalBalance / yMax) * chartHeight;
      text(svg, x + barWidth / 2, Math.max(14, totalY - 8), compactCurrency(totalBalance), "bar-label", "middle");
    }

    tooltipRect(svg, x, barTop, barWidth, margin.top + chartHeight - barTop, avoirNetteTooltipText(year));
  });
}

function renderAvoirNetteLegend(sources) {
  fields.avoirNetteLegend.replaceChildren();
  sources.forEach((source) => {
    const item = document.createElement("span");
    item.className = source.enabled !== false ? "legend-item" : "legend-item legend-item--disabled";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = source.color;
    const label = document.createElement("span");
    label.textContent = source.name;
    item.append(swatch, label);
    fields.avoirNetteLegend.append(item);
  });
}

function avoirNetteTooltipText(year) {
  const lines = [`${year.year}`];
  const totalBalance = year.sourceValues.reduce((sum, sv) => sum + (sv.endingBalance || 0), 0);
  lines.push(`Avoir nette total: ${currency(totalBalance)}`);

  const sourceLines = year.sourceValues
    .filter((sourceValue) => (sourceValue.endingBalance || 0) > 0)
    .map((sourceValue) => `${sourceValue.name} (${sourceValue.color}): ${currency(sourceValue.endingBalance)}`);

  if (sourceLines.length > 0) {
    lines.push(...sourceLines);
  } else {
    lines.push("Aucun avoir");
  }

  return lines.join("\n");
}

function barTooltipText(year) {
  const lines = [`${year.year}`, `Total: ${currency(year.total)}`, `Cible: ${currency(year.target)}`];
  const sourceLines = year.sourceValues
    .filter((sourceValue) => sourceValue.amount > 0)
    .map((sourceValue) => `${sourceValue.name}: ${currency(sourceValue.amount)}`);

  if (sourceLines.length > 0) {
    lines.push(...sourceLines);
  } else {
    lines.push("Aucun decaissement");
  }

  return lines.join("\n");
}

function renderTargetLine(svg, schedule, margin, chartHeight, yearSlotWidth, yMax) {
  if (!schedule.length) return;

  const points = schedule.map((year, index) => ({
    xStart: margin.left + index * yearSlotWidth,
    xEnd: margin.left + (index + 1) * yearSlotWidth,
    y: margin.top + chartHeight - (year.target / yMax) * chartHeight,
    target: year.target
  }));
  let pathData = `M ${points[0].xStart} ${points[0].y}`;

  points.forEach((point, index) => {
    pathData += ` L ${point.xEnd} ${point.y}`;
    const nextPoint = points[index + 1];
    if (nextPoint && nextPoint.y !== point.y) {
      pathData += ` L ${point.xEnd} ${nextPoint.y}`;
    }
  });

  path(svg, pathData, "target-line");

  const lastPoint = points.at(-1);
  text(svg, lastPoint.xEnd, Math.max(14, lastPoint.y - 8), `Cible ${compactCurrency(lastPoint.target)}`, "bar-label", "end");
}

function renderTable(schedule, sources) {
  fields.scheduleHead.replaceChildren();
  fields.scheduleBody.replaceChildren();

  const headRow = document.createElement("tr");
  const sourceHeaders = sources.flatMap((source) => {
    if (isAnnualIncomeSource(source)) return [`${source.name} revenu`];
    return [`${source.name} retrait`, `${source.name} solde`];
  });

  ["Annee", ...sourceHeaders, "Total", "Cible"].forEach((title) => {
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
      const sourceValue = year.sourceValues.find((item) => item.id === source.id);
      const withdrawalCell = document.createElement("td");
      withdrawalCell.textContent = currency(sourceValue?.amount ?? 0);
      row.append(withdrawalCell);

      if (!isAnnualIncomeSource(source)) {
        const balanceCell = document.createElement("td");
        balanceCell.className = "balance-cell";
        balanceCell.textContent = currency(sourceValue?.endingBalance ?? 0);
        row.append(balanceCell);
      }
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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizeState(parsed);
    }
  } catch {}

  try {
    const raw = localStorage.getItem(STORAGE_KEY_V1);
    if (raw) {
      const parsed = JSON.parse(raw);
      const settings = normalizeSettings(parsed);
      const id = crypto.randomUUID();
      return {
        scenarios: [{ id, name: "Scenario 1", settings }],
        activeScenarioId: id
      };
    }
  } catch {}

  const initialSettings = structuredClone(defaultSettings);
  const scenario = { id: crypto.randomUUID(), name: "Scenario 1", settings: initialSettings };
  return { scenarios: [scenario], activeScenarioId: scenario.id };
}

function normalizeState(value) {
  const scenarios = Array.isArray(value?.scenarios) && value.scenarios.length > 0
    ? value.scenarios.map((item) => ({
        id: item.id || crypto.randomUUID(),
        name: item.name || "Sans nom",
        settings: normalizeSettings(item.settings || {})
      }))
    : [{ id: crypto.randomUUID(), name: "Scenario 1", settings: structuredClone(defaultSettings) }];

  const activeId = value?.activeScenarioId && scenarios.find((item) => item.id === value.activeScenarioId)
    ? value.activeScenarioId
    : scenarios[0].id;

  return { scenarios, activeScenarioId: activeId };
}

function normalizeSettings(value) {
  return {
    inflationRate: numberValue(value?.inflationRate ?? defaultSettings.inflationRate),
    showConstantDollars: value?.showConstantDollars !== undefined ? Boolean(value.showConstantDollars) : defaultSettings.showConstantDollars,
    target: {
      startDate: value?.target?.startDate || defaultSettings.target.startDate,
      annualAmount: numberValue(value?.target?.annualAmount || defaultSettings.target.annualAmount),
      durationYears: Math.max(1, Math.round(numberValue(value?.target?.durationYears || defaultSettings.target.durationYears))),
      changes: normalizeTargetChanges(value?.target?.changes)
    },
    sources: Array.isArray(value?.sources) ? value.sources.map((source, index) => ({
      id: source.id || crypto.randomUUID(),
      type: source.type === "annualIncome" ? "annualIncome" : "investment",
      collapsed: Boolean(source.collapsed),
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
      constantWithdrawal: Boolean(source.constantWithdrawal),
      enabled: source.enabled !== false
    })) : []
  };
}

function normalizeTargetChanges(changes) {
  if (!Array.isArray(changes)) return [];

  return sortedTargetChanges(changes.map((change) => ({
    id: change.id || crypto.randomUUID(),
    startDate: change.startDate || defaultSettings.target.startDate,
    annualAmount: numberValue(change.annualAmount)
  })));
}

function sortedTargetChanges(changes) {
  if (!Array.isArray(changes)) return [];

  return [...changes].sort((first, second) => {
    const firstDate = parseDate(first.startDate)?.getTime() ?? 0;
    const secondDate = parseDate(second.startDate)?.getTime() ?? 0;
    return firstDate - secondDate;
  });
}

function targetAmountForDate(target, date) {
  let amount = Math.max(0, numberValue(target.annualAmount));

  sortedTargetChanges(target.changes).forEach((change) => {
    const start = parseDate(change.startDate);
    if (start && start <= date) {
      amount = Math.max(0, numberValue(change.annualAmount));
    }
  });

  return amount;
}

function scheduleSave() {
  globalThis.clearTimeout(saveTimer);
  saveTimer = globalThis.setTimeout(() => {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state));
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

function tooltipRect(svg, x, y, width, height, title) {
  const element = document.createElementNS(SVG_NS, "rect");
  element.setAttribute("x", x);
  element.setAttribute("y", y);
  element.setAttribute("width", width);
  element.setAttribute("height", Math.max(1, height));
  element.setAttribute("class", "bar-hit-area");

  const titleElement = document.createElementNS(SVG_NS, "title");
  titleElement.textContent = title;
  element.append(titleElement);
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

function path(svg, pathData, className) {
  const element = document.createElementNS(SVG_NS, "path");
  element.setAttribute("d", pathData);
  element.setAttribute("class", className);
  element.setAttribute("fill", "none");
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