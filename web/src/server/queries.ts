import { dataApiPublicRpc, dataApiRpc, verifyRuntimeIdentity } from "./data-api";
import type { SyntheticIdentity } from "./identities";
import type { CandidateContent, SourceExcerpt, TerminalState } from "./types";

type DatabaseIdentity = SyntheticIdentity & { databaseAuthToken?: string | null };
export { identityMemberId, memberDisplayName } from "./identities";

export interface PublishedIdeaSummary {
  slug: string; title: string; oneLineSummary: string; language: string; publishedAt: string;
  claimCounts: Record<string, number>; sourceTitle: string | null; sourceType: string | null;
}
export interface PublicClaim {
  type: string; statement: string; rationale: string | null;
  citations: { title: string; urlOrReference: string }[];
}
export interface PublicIdea {
  slug: string; versionNumber: number; language: string; contentLicense: string; publishedAt: string;
  content: CandidateContent; claims: PublicClaim[];
  credits: { displayName: string; contribution: string | null }[];
}
export interface EditorialCaseSummary {
  intakeId: string; title: string; inputMode: string; rightsBasis: string; createdBy: string;
  createdAt: string; revision: number; generationState: TerminalState | "pending" | "running" | null;
  candidateId: string | null; candidateStatus: string | null; publishedSlug: string | null;
}
export interface GenerationAttemptView {
  rank: number; routeKey: string; outcome: string; fallbackReason: string | null; quotaUnits: number;
  startedAt: string; completedAt: string;
}
export interface GenerationView {
  id: string; status: "pending" | "running" | "terminal"; terminalState: TerminalState | null;
  controls: { schemaValid?: boolean; citationsValid?: boolean; prudenceValid?: boolean; reasonCode?: string | null; simulated?: boolean };
  createdAt: string; completedAt: string | null; attempts: GenerationAttemptView[];
}
export interface ReviewDecisionView {
  id: string; decision: "approved" | "rejected"; reason: string; reviewerId: string;
  candidateRevision: number; selfApproval: boolean; createdAt: string;
}
export interface EditorialCaseDetail {
  intakeId: string; title: string; inputMode: "url" | "text"; sourceUrl: string | null;
  publishedAt: string | null; accessedAt: string; fingerprint: string; excerpts: SourceExcerpt[];
  rightsBasis: string; rightsNote: string | null; hasTemporaryText: boolean; createdBy: string;
  createdAt: string; revision: number; decidedAt: string | null; generation: GenerationView | null;
  candidate: { id: string; status: string; createdBy: string; currentRevision: number;
    content: CandidateContent; publishedVersionId: string | null } | null;
  decisions: ReviewDecisionView[]; publishedSlug: string | null;
}

async function tokenFor(identity: DatabaseIdentity): Promise<string> {
  const token = identity.databaseAuthToken ?? "";
  if (!token) throw new Error("JWT Neon Auth requis");
  if (identity.authUserId) await verifyRuntimeIdentity(identity.authUserId, token);
  return token;
}

export async function listPublishedIdeas(): Promise<PublishedIdeaSummary[]> {
  return dataApiPublicRpc("public_list_published_ideas", {});
}
export async function getPublishedIdea(slug: string): Promise<PublicIdea | null> {
  return dataApiPublicRpc("public_get_published_idea", { target_slug: slug });
}
export async function listEditorialCases(identity: DatabaseIdentity): Promise<EditorialCaseSummary[]> {
  if (!identity.authUserId) return [];
  return dataApiRpc("runtime_list_editorial_cases", {}, await tokenFor(identity));
}
export async function getEditorialCase(identity: DatabaseIdentity, intakeId: string): Promise<EditorialCaseDetail | null> {
  if (!identity.authUserId) return null;
  return dataApiRpc("runtime_get_editorial_case", { target_intake_id: intakeId }, await tokenFor(identity));
}
