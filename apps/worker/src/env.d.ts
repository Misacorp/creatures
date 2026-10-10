// Optional secret, only used when LEET_SOURCE is "http". Not in `secrets.required` on purpose, so
// it is absent from the generated types. Merges into the global Env interface.
interface Env {
  LEET_API_KEY?: string;
}
