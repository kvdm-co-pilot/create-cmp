// cmp-receipts — validate create-cmp evidence receipts.
// Single source of truth for the inputs-hash algorithm and the receipt
// predicate; vendored byte-identical into every generated project's qa/lib/
// and consumed by hosted validators. Dependency-free ESM.

export { computeInputsHash, VERIFIED_SURFACE } from "./inputs-hash.mjs";
export {
  RECEIPT_REL_PATH,
  readReceipt,
  evaluateReceipt,
  DEFAULT_POLICY,
  checkFreshness,
  checkExecutionPlausibility,
  listSkippedSteps,
  validateReceiptForTree,
} from "./receipt-validate.mjs";
