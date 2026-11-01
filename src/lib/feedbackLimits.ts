// The forms and the API read the same limits, so a form never accepts text
// that the API then rejects without a word.
export const FEEDBACK_MIN_CHARS = 4;
export const FEEDBACK_FIELD_MAX_CHARS = 10_000;
export const SURVEY_SOURCE_MAX_CHARS = 200;
// The export survey wraps its two answers in a few header lines.
export const FEEDBACK_MESSAGE_MAX_CHARS = FEEDBACK_FIELD_MAX_CHARS + SURVEY_SOURCE_MAX_CHARS + 1_000;
