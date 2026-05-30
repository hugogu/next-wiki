// External auth provider management is handled via the admin provider-service.
// This file re-exports auth instance for convenience in route handlers.
export { auth } from "./index";
