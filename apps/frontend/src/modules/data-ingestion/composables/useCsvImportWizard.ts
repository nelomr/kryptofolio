import { ref, computed, provide, inject, type InjectionKey, type Ref } from "vue";
import type { AccountId, SourceProfileId } from "@kryptofolio/shared-types";
import {
  checkProfileInvariant,
  detectSourceProfile,
  SOURCE_FORMAT_PROFILES,
  type InvariantOutcome,
  type SourceProfileDetection,
} from "@kryptofolio/core-domain";
import { useFileParser } from "./useFileParser";
import { useColumnMapper } from "./useColumnMapper";
import { usePreviewTable } from "./usePreviewTable";
import { useImportProcessor } from "./useImportProcessor";
import {
  detectMarketTypeFromFile,
  type MarketType,
} from "../utils/marketDetector";

/**
 * What the profile layer reports about the dropped file, before anything is submitted.
 *
 * `PROFILE_NOT_CHOSEN` is not an invariant outcome — it is the state of having no profile to check
 * against, which an ambiguous header row produces and only the user can resolve.
 */
export type InvariantStatus = InvariantOutcome["kind"] | "PROFILE_NOT_CHOSEN";

export type WizardStep = 1 | 2 | 3;

export interface CsvImportWizardContext {
  step: Ref<WizardStep>;
  marketType: Ref<MarketType>;
  selectedAccountId: Ref<AccountId | "">;
  sourceProfile: Ref<SourceProfileId | "">;
  sourceProfileDetection: Ref<SourceProfileDetection>;
  invariantOutcome: Ref<InvariantOutcome | null>;
  invariantStatus: Ref<InvariantStatus>;
  requiresProfileChoice: Ref<boolean>;
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
  /**
   * Empty means unchosen, and it is a state the wizard can be in: on an ambiguity a default among
   * equal candidates would be the array-order defect of the deleted parser registry wearing a
   * different hat, so nothing is selected and the user decides.
   */
  const sourceProfile = ref<SourceProfileId | "">("");
  const sourceProfileDetection = ref<SourceProfileDetection>({ kind: "UNRECOGNISED" });

  const fileParser = useFileParser();
  const columnMapper = useColumnMapper();
  const previewTable = usePreviewTable(marketType);
  const importProcessor = useImportProcessor();

  /**
   * Whatever independent redundancy the resolved profile declares, checked against the rows the user
   * is about to submit. Derived rather than stored, so a change of profile in the selector re-checks
   * without any refresh step.
   */
  const invariantOutcome = computed<InvariantOutcome | null>(() => {
    if (sourceProfile.value === "") return null;
    if (previewTable.rows.value.length === 0 && fileParser.rawRows.value.length === 0) return null;
    const profile = SOURCE_FORMAT_PROFILES[sourceProfile.value];
    return checkProfileInvariant(
      profile,
      previewTable.rows.value.map((row) => row.mappedData),
    );
  });

  const invariantStatus = computed<InvariantStatus>(() =>
    sourceProfile.value === "" ? "PROFILE_NOT_CHOSEN" : invariantOutcome.value?.kind ?? "PROFILE_NOT_CHOSEN",
  );

  const requiresProfileChoice = computed(
    () => sourceProfileDetection.value.kind === "AMBIGUOUS" && sourceProfile.value === "",
  );

  const handleFileUpload = async (file: File) => {
    const result = await fileParser.parseFile(file);
    if (!result || result.errors.length > 0) return false;

    // Headers are the only source signature available before any column has been mapped.
    const detection = detectSourceProfile(result.headers);
    sourceProfileDetection.value = detection;
    sourceProfile.value =
      detection.kind === "RESOLVED"
        ? detection.profileId
        : detection.kind === "UNRECOGNISED"
          ? "generic"
          : "";

    marketType.value = resolveMarketType(file.name);

    // The mapping is the user's, and the profile answers only questions it cannot.
    columnMapper.initializeMapping(result.headers);

    previewTable.generatePreview(
      result.data,
      columnMapper.mapping.value,
      resolvedProfile(),
    );

    return true;
  };

  /** Undefined while the choice is the user's — an unchosen profile applies nothing. */
  const resolvedProfile = () =>
    sourceProfile.value === "" ? undefined : SOURCE_FORMAT_PROFILES[sourceProfile.value];

  /**
   * A profile knows its market as a declared fact. The file name is consulted only where no profile
   * declares one, which is the single case the old filename guess still answers better than nothing.
   */
  const resolveMarketType = (fileName: string): MarketType => {
    if (sourceProfile.value !== "") {
      const declared = SOURCE_FORMAT_PROFILES[sourceProfile.value].market;
      if (declared.kind !== "UNDECLARED") return declared.kind;
    }
    return detectMarketTypeFromFile(fileName);
  };

  const goToNextStep = () => {
    // An unresolved ambiguity is the user's to settle: advancing would carry an unchosen convention
    // into the preview.
    if (requiresProfileChoice.value) return;
    if (step.value === 1) {
      // Regenerated here because the user may have changed the mapping, so the profile has to come
      // with it: a preview rebuilt without it would show quantities the ledger will never hold.
      previewTable.generatePreview(
        fileParser.rawRows.value,
        columnMapper.mapping.value,
        resolvedProfile(),
      );
      step.value = 2;
    }
  };

  const goToPreviousStep = () => {
    if (step.value === 2) step.value = 1;
  };

  const submitImport = async () => {
    if (sourceProfile.value === "") {
      importProcessor.processingErrors.value = ["ingestion.errors.source_profile_required"];
      return false;
    }

    const success = await importProcessor.processAndSubmit(
      previewTable.validRows.value,
      marketType.value === "SPOT" ? "spot" : "futures",
      selectedAccountId.value,
      sourceProfile.value,
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
    sourceProfile.value = "";
    sourceProfileDetection.value = { kind: "UNRECOGNISED" };
    previewTable.rows.value = [];
    fileParser.resetParser();
  };

  const context: CsvImportWizardContext = {
    step,
    marketType,
    selectedAccountId,
    sourceProfile,
    sourceProfileDetection,
    invariantOutcome,
    invariantStatus,
    requiresProfileChoice,
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
