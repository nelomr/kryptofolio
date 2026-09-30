/**
 * AdvisorEvent — the domain vocabulary `IAdvisorPort.ask` yields.
 *
 * DOMAIN ISOLATION RULE: No external library imports allowed here.
 * Deliberately distinct from the wire type `AdvisorStreamEvent` (`@kryptofolio/shared-types`):
 * `infrastructure/dtos/advisor.ts` owns the single `toWireEvent` mapping between them, so no test or
 * document has to keep two vocabularies in sync by hand. `AdvisorEvent.kind` → `AdvisorStreamEvent.kind`:
 * `completed` → `done`, `refused` → `refused`, `failed` → `failed`.
 */
import type {
  AdvisorToolName,
  AdvisorCauselessFailureCode,
  AdvisorProviderFailureCause,
  AdvisorToolErrorCode,
} from '@kryptofolio/shared-types';
import type { AdvisorRunReceipt, ProfiledAdvisorRunReceipt } from './AdvisorRunReceipt.js';

export type AdvisorEvent =
  | { readonly kind: 'token'; readonly text: string; readonly runId: string }
  | { readonly kind: 'tool-start'; readonly callId: string; readonly tool: AdvisorToolName; readonly runId: string }
  | { readonly kind: 'tool-result'; readonly callId: string; readonly tool: AdvisorToolName; readonly runId: string }
  | {
      readonly kind: 'tool-error';
      readonly callId: string;
      readonly tool: AdvisorToolName;
      readonly code: AdvisorToolErrorCode;
      readonly runId: string;
    }
  | {
      readonly kind: 'completed';
      readonly runId: string;
      readonly receipt: ProfiledAdvisorRunReceipt;
      /** The investment-content disclaimer applies to this answer; the client renders its own wording. */
      readonly disclaimer: boolean;
      /** A tool result of this run reported a partial total, so the answer's figures may be incomplete. */
      readonly figuresIncomplete: boolean;
    }
  | {
      readonly kind: 'refused';
      readonly runId: string;
      readonly reason: string;
      readonly processorId: string;
      readonly receipt: AdvisorRunReceipt;
    }
  | {
      readonly kind: 'failed';
      readonly runId: string;
      readonly code: AdvisorCauselessFailureCode;
      readonly receipt: AdvisorRunReceipt;
    }
  | {
      readonly kind: 'failed';
      readonly runId: string;
      readonly code: 'ALL_PROVIDERS_FAILED';
      /** The last chain entry to fail: once every entry is exhausted, earlier failures are not surfaced. */
      readonly cause: AdvisorProviderFailureCause;
      readonly receipt: AdvisorRunReceipt;
    };
