// Optional secrets, not in `secrets.required` on purpose, so they are absent from the generated types.
// Merges into the global Env interface.
// LEET_API_KEY: only used when LEET_SOURCE is "http".
// OPS_TOKEN: the bearer token of GET /api/ops/report. Unset or empty: that route answers 404.
interface Env {
  LEET_API_KEY?: string;
  OPS_TOKEN?: string;
}
