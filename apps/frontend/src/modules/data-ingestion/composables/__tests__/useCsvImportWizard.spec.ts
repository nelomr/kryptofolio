import { describe, it, expect, vi } from "vitest";
import { useCsvImportWizardProvider } from "../useCsvImportWizard";

// Mock dependencies to focus on orchestration logic
vi.mock("../useFileParser", () => {
  return {
    useFileParser: () => ({
      parseFile: vi.fn().mockResolvedValue({
        data: [{ Date: "2023-01-01" }],
        headers: ["Date"],
        errors: [],
      }),
      resetParser: vi.fn(),
      rawRows: { value: [{ Date: "2023-01-01" }] },
    }),
  };
});

vi.mock("../useImportProcessor", () => ({
  useImportProcessor: () => ({
    processAndSubmit: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock("../../utils/marketDetector", () => ({
  detectMarketTypeFromFile: vi.fn().mockReturnValue("SPOT"),
}));

describe("useCsvImportWizard", () => {
  it("should initialize and orchestrate file upload", async () => {
    // Note: Provide/inject normally requires a Vue component context for `provide` to work.
    // However, Vue 3 allows calling provide outside of setup if run inside a test
    // that mocks or doesn't strictly enforce app context, but typically we might get a warning.
    // For pure unit testing of the returned context, we just test the returned object.

    // We suppress the Vue warn about provide() outside setup for this unit test
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const wizard = useCsvImportWizardProvider();

    expect(wizard.step.value).toBe(1);
    expect(wizard.marketType.value).toBe("SPOT");

    const file = new File([""], "test.csv");
    const success = await wizard.handleFileUpload(file);

    expect(success).toBe(true);
    expect(wizard.columnMapper.headers.value).toEqual(["Date"]);

    warnSpy.mockRestore();
  });

  it("should handle step transitions", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wizard = useCsvImportWizardProvider();

    expect(wizard.step.value).toBe(1);

    wizard.goToNextStep();
    expect(wizard.step.value).toBe(2);

    wizard.goToPreviousStep();
    expect(wizard.step.value).toBe(1);

    warnSpy.mockRestore();
  });
});
