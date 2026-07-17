/** In-memory revocation registry for tokens and token families. */
export class RevocationRegistry {
  private readonly tokens = new Set<string>();
  private readonly families = new Set<string>();

  revokeToken(tokenId: string): void {
    this.tokens.add(tokenId);
  }

  revokeFamily(familyId: string): void {
    this.families.add(familyId);
  }

  isRevoked(tokenId: string, familyId?: string): boolean {
    return this.tokens.has(tokenId) || (familyId !== undefined && this.families.has(familyId));
  }
}
