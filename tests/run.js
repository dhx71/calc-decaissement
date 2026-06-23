const fs = require("fs");
const vm = require("vm");

// ── Universal DOM mock (Proxy-based, accepts any property) ─────────────────
function deepMock() {
  const fn = () => {};
  return new Proxy(fn, {
    get(_, prop) {
      if (prop === "then") return undefined;
      if (typeof prop === "string" && prop.startsWith("data-")) return null;
      return deepMock();
    },
    apply() { return deepMock(); },
    set(_, prop, value) { return true; },
    has(_, prop) { return true; },
    ownKeys() { return []; },
    getOwnPropertyDescriptor() { return { configurable: true, enumerable: true }; },
  });
}

function elMock() { return deepMock(); }
function domMock() { return deepMock(); }

// ── Browser API mocks ──────────────────────────────────────────────────────
const sandbox = {};
sandbox.document = {
  querySelector: domMock,
  querySelectorAll: () => ({ forEach: () => {}, length: 0, [Symbol.iterator]: () => ({ next: () => ({ done: true, value: undefined }) }) }),
  createElement: elMock,
  createElementNS: elMock,
  body: elMock(),
  head: elMock(),
  addEventListener: () => {},
};
sandbox.localStorage = { getItem: () => null, setItem: () => {} };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.crypto = { randomUUID: () => "test-" + Math.random().toString(36).slice(2, 10) };
sandbox.navigator = { storage: { persist: async () => false, persisted: async () => false } };
sandbox.setTimeout = () => 0;
sandbox.clearTimeout = () => {};
sandbox.alert = () => {};
sandbox.Blob = class {};
sandbox.URL = { createObjectURL: () => "", revokeObjectURL: () => {} };
sandbox.Intl = Intl;
sandbox.location = { search: "", href: "" };
sandbox.history = { replaceState: () => {} };
sandbox.URLSearchParams = URLSearchParams;
sandbox.MutationObserver = class { observe() {} disconnect() {} };
sandbox.console = console;
sandbox.structuredClone = structuredClone;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

// ── Load app.js in sandbox ─────────────────────────────────────────────────
const appCode = fs.readFileSync(__dirname + "/../app.js", "utf8");
vm.createContext(sandbox);
vm.runInContext(appCode, sandbox);

// ── Pull out functions the test runner needs ───────────────────────────────
const { normalizeSettings, buildSchedule, isAnnualIncomeSource, isExpenseSource } = sandbox;

// ── Test runner ────────────────────────────────────────────────────────────

function flattenSchedule(schedule, sources) {
  return schedule.map((year) => {
    const row = [year.year];
    sources.forEach((source) => {
      const sv = year.sourceValues.find((item) => item.id === source.id);
      row.push(sv?.amount ?? 0);
      if (!isAnnualIncomeSource(source) && !isExpenseSource(source)) {
        row.push(sv?.endingBalance ?? 0);
      }
    });
    row.push(year.total);
    row.push(year.target);
    return row;
  });
}

function runTest(description, settingsLike, expectedRows) {
  // settingsLike matches the import/export JSON shape.
  // showConstantDollars can be set directly in the object.
  const normalized = normalizeSettings(settingsLike);
  const schedule = buildSchedule(normalized);
  const sources = normalized.sources.filter((s) => s.enabled !== false);
  const actualRows = flattenSchedule(schedule, sources);

  let failed = 0;
  const limit = expectedRows.length;

  for (let i = 0; i < limit; i++) {
    const expected = expectedRows[i];
    const actual = actualRows[i];
    if (!actual) {
      console.log(`  FAIL row ${i}: missing — expected [${expected?.join(", ")}]`);
      failed++;
      continue;
    }
    if (expected.length !== actual.length) {
      console.log(
        `  FAIL row ${i}: expected ${expected.length} cols, got ${actual.length}`
      );
      failed++;
      continue;
    }
    const mismatches = [];
    for (let j = 0; j < expected.length; j++) {
      if (Math.abs(expected[j] - actual[j]) > 0.01) {
        mismatches.push(`col ${j}: expected ${expected[j]}, got ${actual[j]}`);
      }
    }
    if (mismatches.length) {
      console.log(`  FAIL row ${i}: ${mismatches.join(" | ")}`);
      failed++;
    }
  }

  if (failed === 0) {
    console.log(`PASS  ${description}`);
  } else {
    console.log(`FAIL  ${description}  (${failed} mismatches)`);
  }

  if (failed > 0) {
    console.log("  Expected:");
    expectedRows.slice(0, 10).forEach((r, i) => console.log(`  [${r.join(", ")}]`));
    console.log("  Actual:");
    actualRows.slice(0, 10).forEach((r, i) => console.log(`  [${r.join(", ")}]`));
  }
  console.log("");
}

// ── Sample test ────────────────────────────────────────────────────────────
//
// Inflation 2 %, start 2055-01-01, duration 40 years, target 95 000 $.
// One source REER : 1 530 000 $ initial, 5 % return, no contributions,
// starts immediately.  "Afficher en dollars constants" UNCHECKED.

const scenario = {
  inflationRate: 2,
  showConstantDollars: false,
  target: {
    startDate: "2055-01-01",
    annualAmount: 95000,
    durationYears: 40,
  },
  sources: [
    {
      id: "src-reer",
      type: "investment",
      name: "REER",
      initialAmount: 1530000,
      initialDate: "2055-01-01",
      annualReturnRate: 5,
      contributionAmount: 0,
      contributionPeriod: "monthly",
      withdrawalStartDate: "2055-01-01",
      endDate: "2094-12-31",
      constantWithdrawal: false,
      enabled: true,
      color: "#1f7a8c",
    },
  ],
};

runTest("scénario nominal – 2 premières années", scenario, [
  // [Annee, REER retrait, REER solde, Total, Cible]
  [2055, 95000, 1506750, 95000, 95000],
  [2056, 96900, 1480342.50, 96900, 96900],
]);

// ── Expense test ───────────────────────────────────────────────────────────
// Same scenario + $500 000 house purchase in 2056 (year 2).

const expenseScenario = {
  inflationRate: 2,
  showConstantDollars: false,
  target: {
    startDate: "2055-01-01",
    annualAmount: 95000,
    durationYears: 40,
  },
  sources: [
    {
      id: "src-reer",
      type: "investment",
      name: "REER",
      initialAmount: 1530000,
      initialDate: "2055-01-01",
      annualReturnRate: 5,
      contributionAmount: 0,
      contributionPeriod: "monthly",
      withdrawalStartDate: "2055-01-01",
      endDate: "2094-12-31",
      constantWithdrawal: false,
      enabled: true,
      color: "#1f7a8c",
    },
    {
      id: "src-maison",
      type: "expense",
      name: "Maison",
      expenseAmount: 500000,
      expenseDate: "2056-06-15",
      enabled: true,
      color: "#d95f43",
    },
  ],
};

runTest("scénario avec dépense maison en 2056", expenseScenario, [
  // [Annee, REER retrait, REER solde, Maison depense, Total, Cible]
  [2055, 95000, 1506750, 0, 95000, 95000],
  [2056, 606900, 944842.50, 510000, 606900, 96900],
]);
