import { describe, it, expect, vi, beforeEach } from "vitest";

import { useCsvImportWizardProvider } from "../useCsvImportWizard";

/**
 * The parser is the only thing mocked: the column mapper, the preview table and the profile layer are
 * the real implementations, so the assertions are about the wizard's own orchestration.
 */
const parseResult = vi.hoisted(() => ({
  current: { data: [] as Record<string, unknown>[], headers: [] as string[], errors: [] as string[] },
}));

vi.mock("../useFileParser", () => ({
  useFileParser: () => ({
    isParsing: { value: false },
    parseErrors: { value: [] },
    rawHeaders: { value: parseResult.current.headers },
    rawRows: { value: parseResult.current.data },
    parseFile: vi.fn().mockImplementation(async () => parseResult.current),
    resetParser: vi.fn(),
  }),
}));

const submitted = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("../useImportProcessor", () => ({
  useImportProcessor: () => ({
    isProcessing: { value: false },
    processingErrors: { value: [] },
    timezone: { value: "UTC" },
    processAndSubmit: vi.fn().mockImplementation(async (...args: unknown[]) => {
      submitted.calls.push(args);
      return true;
    }),
  }),
}));

const KRAKEN_HEADERS = [
  "txid", "refid", "time", "type", "subtype", "aclass", "subclass",
  "asset", "wallet", "amount", "fee", "balance",
];

/** Two real Kraken rows, whose running balance reconciles. */
const KRAKEN_ROWS = [
  {
    txid: "LCKZLQ-KHWZX-5GMPCU", refid: "FTNGi1e", time: "2025-09-16 12:06:58",
    type: "deposit", subtype: "", aclass: "currency", subclass: "fiat",
    asset: "EUR", wallet: "spot / main", amount: "50.0000", fee: "0", balance: "50.0000",
  },
  {
    txid: "LJS3C4-CF4EJ-F7AMSP", refid: "FTHddQG", time: "2025-09-22 11:19:45",
    type: "deposit", subtype: "", aclass: "currency", subclass: "fiat",
    asset: "EUR", wallet: "spot / main", amount: "500.0000", fee: "0", balance: "550.0000",
  },
];

const KRAKEN_FUTURES_HEADERS = [
  "uid", "dateTime", "account", "type", "symbol", "contract", "change", "new balance",
  "new average entry price", "trade price", "mark price", "funding rate", "realized pnl",
  "fee", "realized funding", "collateral", "conversion spread percentage",
  "liquidation fee", "position uid",
];

function silenceProvideWarning() {
  return vi.spyOn(console, "warn").mockImplementation(() => {});
}

beforeEach(() => {
  submitted.calls = [];
  parseResult.current = { data: [], headers: [], errors: [] };
});

describe("the wizard resolves a source profile without changing its flow", () => {
  it("detects the profile from the parsed headers and still maps the columns", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: KRAKEN_ROWS, headers: KRAKEN_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    const success = await wizard.handleFileUpload(new File([""], "ledger.csv"));

    expect(success).toBe(true);
    expect(wizard.sourceProfile.value).toBe("kraken-spot");
    // The mapping layer is untouched and the user may still change any column.
    expect(wizard.columnMapper.headers.value).toEqual(KRAKEN_HEADERS);
    expect(wizard.columnMapper.mapping.value["balance"]).toBe("balance");
    expect(wizard.previewTable.rows.value.length).toBe(2);
    warn.mockRestore();
  });

  it("keeps three steps and presents the profile inside the existing flow", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: KRAKEN_ROWS, headers: KRAKEN_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    expect(wizard.step.value).toBe(1);
    await wizard.handleFileUpload(new File([""], "ledger.csv"));
    wizard.goToNextStep();
    expect(wizard.step.value).toBe(2);
    warn.mockRestore();
  });

  it("reports a verified invariant on rows that satisfy it", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: KRAKEN_ROWS, headers: KRAKEN_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "ledger.csv"));

    expect(wizard.invariantOutcome.value).toEqual({ kind: "VERIFIED", rowsChecked: 2 });
    expect(wizard.invariantStatus.value).toBe("VERIFIED");
    warn.mockRestore();
  });

  it("reports a failed invariant rather than proceeding as though the convention held", async () => {
    const warn = silenceProvideWarning();
    const tampered = [KRAKEN_ROWS[0], { ...KRAKEN_ROWS[1], balance: "999.0000" }];
    parseResult.current = { data: tampered, headers: KRAKEN_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "ledger.csv"));

    expect(wizard.invariantStatus.value).toBe("FAILED");
    if (wizard.invariantOutcome.value?.kind !== "FAILED") throw new Error("expected FAILED");
    expect(wizard.invariantOutcome.value.profileId).toBe("kraken-spot");
    warn.mockRestore();
  });

  it("distinguishes could-not-verify from verified", async () => {
    const warn = silenceProvideWarning();
    const noBalances = KRAKEN_ROWS.map((row) => ({ ...row, balance: "" }));
    parseResult.current = { data: noBalances, headers: KRAKEN_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "ledger.csv"));

    expect(wizard.invariantStatus.value).toBe("COULD_NOT_VERIFY");
    warn.mockRestore();
  });

  it("says a source declares no invariant instead of claiming verification", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = {
      data: [{ Date: "2025-06-03 10:01:00 UTC", Type: "WALLET_ACTIVATION", Asset: "XRP", Amount: "1.0", Fee: "0.0", Notes: "reserve" }],
      headers: ["Date", "Type", "Asset", "Amount", "Fee", "Notes"],
      errors: [],
    };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "tangem.csv"));

    expect(wizard.sourceProfile.value).toBe("tangem");
    expect(wizard.invariantStatus.value).toBe("NOT_DECLARED");
    warn.mockRestore();
  });
});

describe("the profile reaches the rows the user reviews, not only the ones just parsed", () => {
  const BIT2ME_HEADERS = [
    "Tipo de operación", "Cantidad de destino", "Moneda de destino", "Cantidad de origen",
    "Moneda de origen", "Comisión de la operación", "Moneda de la comisión", "Exchange",
    "Grupo", "Descripción", "Fecha",
  ];

  /** A real Bit2Me deposit shape: one movement written onto both directional columns. */
  const BIT2ME_DEPOSIT = {
    "Tipo de operación": "Deposit",
    "Cantidad de destino": "220",
    "Moneda de destino": "HBAR",
    "Cantidad de origen": "220",
    "Moneda de origen": "HBAR",
    "Comisión de la operación": "0",
    "Moneda de la comisión": "EUR",
    Exchange: "Bit2Me",
    Grupo: "pocket",
    Descripción: "",
    Fecha: "2024-01-05 10:00:00",
  };

  it("keeps a both-sides-written row reduced to one side after advancing to the review step", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: [BIT2ME_DEPOSIT], headers: BIT2ME_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "bit2me.csv"));
    expect(wizard.sourceProfile.value).toBe("bit2me-spot");

    // The step the user actually reviews is generated here, and it must not lose the profile.
    wizard.goToNextStep();

    expect(wizard.previewTable.rows.value).toHaveLength(1);
    const reviewed = wizard.previewTable.rows.value[0].mappedData;
    expect(reviewed.amount_in).toBe("220");
    expect(reviewed.amount_out).toBeUndefined();
    expect(reviewed.asset_out).toBeUndefined();
    warn.mockRestore();
  });
});

describe("the invariant reads the source's own redundancy, including on rows the mapper rejected", () => {
  /**
   * The middle row states no time, so canonical validation rejects it — but its asset, amount and
   * balance are the source's own and they are what the running balance is a statement about.
   * Dropping it would splice the chain and report a failure the file does not contain.
   */
  const WITH_A_REJECTED_ROW = [
    KRAKEN_ROWS[0],
    { ...KRAKEN_ROWS[1], time: "", amount: "100.0000", balance: "150.0000" },
    { ...KRAKEN_ROWS[1], time: "2025-09-23 08:00:00", amount: "25.0000", balance: "175.0000" },
  ];

  it("checks every parsed row, not only the valid ones", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: WITH_A_REJECTED_ROW, headers: KRAKEN_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "ledger.csv"));

    expect(wizard.previewTable.invalidRows.value).toHaveLength(1);
    expect(wizard.invariantOutcome.value).toEqual({ kind: "VERIFIED", rowsChecked: 3 });
    warn.mockRestore();
  });
});

describe("the wizard's market type follows the profile, not the file name", () => {
  it("ingests a futures export as futures however the file is named", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: [], headers: KRAKEN_FUTURES_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "enero-movimientos.csv"));

    expect(wizard.sourceProfile.value).toBe("kraken-futures");
    expect(wizard.marketType.value).toBe("FUTURES");
    warn.mockRestore();
  });

  it("ingests a spot export as spot even when its name says otherwise", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: KRAKEN_ROWS, headers: KRAKEN_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "mis_futuros_kraken.csv"));

    expect(wizard.sourceProfile.value).toBe("kraken-spot");
    expect(wizard.marketType.value).toBe("SPOT");
    warn.mockRestore();
  });

  it("falls back to the file name only when no profile declares a market", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: [{ foo: "1" }], headers: ["foo", "bar"], errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "binance_derivatives.csv"));

    expect(wizard.sourceProfile.value).toBe("generic");
    expect(wizard.marketType.value).toBe("FUTURES");
    warn.mockRestore();
  });

  it("leaves an explicit user choice standing", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: KRAKEN_ROWS, headers: KRAKEN_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "ledger.csv"));
    wizard.marketType.value = "FUTURES";

    expect(wizard.marketType.value).toBe("FUTURES");
    warn.mockRestore();
  });
});

describe("an ambiguous header row leaves the choice to the user", () => {
  const AMBIGUOUS_HEADERS = [
    "Date (UTC)", "Label", "Outgoing Asset", "Outgoing Amount", "Incoming Asset",
    "Incoming Amount", "Fee Asset", "Fee Amount", "Trx. ID",
    "Timezone", "Quote Currency", "Quote Price", "Received / Paid Currency",
    "Received / Paid Amount", "Fee currency", "Fee amount", "Transaction ID",
  ];

  it("leaves the selector unset and lists every candidate", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: [], headers: AMBIGUOUS_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "mixed.csv"));

    expect(wizard.sourceProfile.value).toBe("");
    expect(wizard.requiresProfileChoice.value).toBe(true);
    if (wizard.sourceProfileDetection.value.kind !== "AMBIGUOUS") {
      throw new Error("expected AMBIGUOUS");
    }
    expect([...wizard.sourceProfileDetection.value.candidates].sort()).toEqual([
      "bitunix-spot",
      "bitvavo-spot",
    ]);
    warn.mockRestore();
  });

  it("does not advance past the file step until the user has chosen", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: [], headers: AMBIGUOUS_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "mixed.csv"));
    wizard.goToNextStep();
    expect(wizard.step.value).toBe(1);

    wizard.sourceProfile.value = "bitvavo-spot";
    expect(wizard.requiresProfileChoice.value).toBe(false);
    wizard.goToNextStep();
    expect(wizard.step.value).toBe(2);
    warn.mockRestore();
  });

  it("recomputes the invariant once the user picks a profile", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: KRAKEN_ROWS, headers: AMBIGUOUS_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "mixed.csv"));
    expect(wizard.invariantStatus.value).toBe("PROFILE_NOT_CHOSEN");

    wizard.sourceProfile.value = "bitunix-spot";
    expect(wizard.invariantStatus.value).toBe("NOT_DECLARED");
    warn.mockRestore();
  });
});

describe("the selected profile reaches the submission", () => {
  it("passes the identifier as the fourth argument of processAndSubmit", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: KRAKEN_ROWS, headers: KRAKEN_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "ledger.csv"));
    wizard.selectedAccountId.value = "10000000-0000-0000-0000-000000000001" as never;

    await wizard.submitImport();

    expect(submitted.calls).toHaveLength(1);
    expect(submitted.calls[0][3]).toBe("kraken-spot");
    warn.mockRestore();
  });

  it("refuses to submit while no profile is chosen", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: [], headers: ["totally", "unknown"], errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "x.csv"));
    wizard.sourceProfile.value = "";

    const success = await wizard.submitImport();
    expect(success).toBe(false);
    expect(submitted.calls).toHaveLength(0);
    warn.mockRestore();
  });

  it("resets the profile with the rest of the wizard", async () => {
    const warn = silenceProvideWarning();
    parseResult.current = { data: KRAKEN_ROWS, headers: KRAKEN_HEADERS, errors: [] };

    const wizard = useCsvImportWizardProvider();
    await wizard.handleFileUpload(new File([""], "ledger.csv"));
    wizard.resetWizard();

    expect(wizard.sourceProfile.value).toBe("");
    expect(wizard.sourceProfileDetection.value.kind).toBe("UNRECOGNISED");
    expect(wizard.invariantOutcome.value).toBeNull();
    warn.mockRestore();
  });
});
