import { ref, provide, inject, type InjectionKey, type Ref } from "vue";
import type { AccountId } from "@kryptofolio/shared-types";
import { useFileParser } from "./useFileParser";
import { useColumnMapper } from "./useColumnMapper";
import { usePreviewTable } from "./usePreviewTable";
import { useImportProcessor } from "./useImportProcessor";
import {
  detectMarketTypeFromFile,
  type MarketType,
} from "../utils/marketDetector";

export type WizardStep = 1 | 2 | 3;

export interface CsvImportWizardContext {
  step: Ref<WizardStep>;
  marketType: Ref<MarketType>;
  selectedAccountId: Ref<AccountId | "">;
  fileParser: ReturnType<typeof useFileParser>;
  columnMapper: ReturnType<typeof useColumnMapper>;
  previewTable: ReturnType<typeof usePreviewTable>;
  importProcessor: ReturnType<typeof useImportProcessor>;

  handleFileUpload: (file: File) => Promise<boolean>;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  submitImport: () => Promise<boolean>;
  resetWizard: () => void;
}

export const CsvImportWizardKey: InjectionKey<CsvImportWizardContext> =
  Symbol("CsvImportWizard");

export function useCsvImportWizardProvider() {
  const step = ref<WizardStep>(1);
  const marketType = ref<MarketType>("SPOT");
  const selectedAccountId = ref<AccountId | "">("");

  const fileParser = useFileParser();
  const columnMapper = useColumnMapper();
  const previewTable = usePreviewTable(marketType);
  const importProcessor = useImportProcessor();

  const handleFileUpload = async (file: File) => {
    marketType.value = detectMarketTypeFromFile(file.name);

    const result = await fileParser.parseFile(file);
    if (!result || result.errors.length > 0) return false;

    columnMapper.initializeMapping(result.headers);

    previewTable.generatePreview(result.data, columnMapper.mapping.value);

    return true;
  };

  const goToNextStep = () => {
    if (step.value === 1) {
      previewTable.generatePreview(
        fileParser.rawRows.value,
        columnMapper.mapping.value,
      );
      step.value = 2;
    }
  };

  const goToPreviousStep = () => {
    if (step.value === 2) step.value = 1;
  };

  const submitImport = async () => {
    const success = await importProcessor.processAndSubmit(
      previewTable.validRows.value,
      marketType.value === "SPOT" ? "spot" : "futures",
      selectedAccountId.value
    );
    if (success) {
      step.value = 3;
    }
    return success;
  };

  const resetWizard = () => {
    step.value = 1;
    marketType.value = "SPOT";
    selectedAccountId.value = "";
    fileParser.resetParser();
  };

  const context: CsvImportWizardContext = {
    step,
    marketType,
    selectedAccountId,
    fileParser,
    columnMapper,
    previewTable,
    importProcessor,
    handleFileUpload,
    goToNextStep,
    goToPreviousStep,
    submitImport,
    resetWizard,
  };

  provide(CsvImportWizardKey, context);

  return context;
}

export function useCsvImportWizard() {
  const context = inject(CsvImportWizardKey);
  if (!context) {
    throw new Error(
      "useCsvImportWizard must be used within a component that calls useCsvImportWizardProvider",
    );
  }
  return context;
}
