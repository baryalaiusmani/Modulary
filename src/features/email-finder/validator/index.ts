export { validateEmail } from "./validate";
export { processBulkValidation, detectEmailColumn } from "./bulk";
export type {
  EmailValidationResult, BulkResult, BulkRowResult, BulkSummary,
  ValidationOptions, FinalStatus, VerdictSimple, SmtpCheck,
} from "./types";
