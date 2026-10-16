// Optional secrets, not in `secrets.required` on purpose, so they are absent from the generated types.
// Merges into the global Env interface.
// LEET_API_KEY: only used when LEET_SOURCE is "http".
// OPS_TOKEN: the bearer token of GET /api/ops/report and of the feedback export routes (pending,
// exported). Unset or empty: those routes answer 404.
// FEEDBACK_READ_TOKEN: the read-only bearer token of GET /api/ops/feedback/report and /screenshot.
// Unset or empty: those two routes answer 404. It cannot call any other route.
interface Env {
  LEET_API_KEY?: string;
  OPS_TOKEN?: string;
  FEEDBACK_READ_TOKEN?: string;
}
