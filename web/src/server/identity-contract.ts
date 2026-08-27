export interface AppIdentity {
  key: string;
  displayName: string;
  authUserId: string | null;
  memberId: string | null;
  /** JWT Neon Auth réservé au repository membre côté serveur. */
  databaseAuthToken?: string | null;
  roles: ("contributor" | "reviewer" | "admin")[];
  description: string;
}

export function canContribute(identity: AppIdentity): boolean {
  return identity.roles.includes("contributor") || identity.roles.includes("admin");
}

export function canReview(identity: AppIdentity): boolean {
  return identity.roles.includes("reviewer") || identity.roles.includes("admin");
}

export function identityMemberId(identity: AppIdentity): string | null {
  return identity.memberId;
}

/** Les requêtes enrichiront ce libellé; aucun nom de fixture n'est utilisé au runtime. */
export function memberDisplayName(memberId: string | null): string {
  return memberId ? "Membre" : "Service";
}
