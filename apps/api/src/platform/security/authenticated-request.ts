import type { AuthContext, Principal } from "@knowget/auth";

/**
 * The subset of the HTTP request the security layer reads and augments. Guards
 * attach {@link principal}/{@link auth} after a token is verified; downstream
 * handlers and the {@link CurrentPrincipal} decorator read them back.
 */
export interface AuthenticatedRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly ip?: string;
  readonly socket?: { readonly remoteAddress?: string };
  principal?: Principal;
  auth?: AuthContext;
}
