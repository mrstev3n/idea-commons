import { withDbRole } from "./db";
import type { SyntheticIdentity } from "./identities";
import type { CandidateContent, SourceExcerpt, TerminalState } from "./types";

export { identityMemberId, memberDisplayName } from "./identities";

/**
 * Lectures IC-07. Les lectures publiques s'exécutent sous le rôle `anonymous`
 * (projection catalogue M0 uniquement) ; les lectures éditoriales sous
 * `authenticated` avec la RLS M1 (créateur ou capacité reviewer).
 */

/* ---------- Catalogue public ---------- */

export interface PublishedIdeaSummary {
  slug: string;
  title: string;
  oneLineSummary: string;
  language: string;
  publishedAt: string;
  claimCounts: Record<string, number>;
  sourceTitle: string | null;
  sourceType: string | null;
}

export async function listPublishedIdeas(): Promise<PublishedIdeaSummary[]> {
  return withDbRole("anonymous", null, async (tx) => {
    const result = await tx.query<{
      slug: string;
      title: string;
      one_line_summary: string;
      language: string;
      published_at: string;
      claim_counts: Record<string, number> | null;
      source_title: string | null;
      source_type: string | null;
    }>(
      `select i.slug,
              v.content->>'title' as title,
              v.content->>'oneLineSummary' as one_line_summary,
              v.language,
              v.published_at,
              (select jsonb_object_agg(claim_type, total)
                 from (select c.claim_type::text as claim_type, count(*) as total
                         from app.claims c
                        where c.idea_version_id = v.id
                        group by c.claim_type) counts) as claim_counts,
              (select s.title
                 from app.claims c
                 join app.claim_sources cs on cs.claim_id = c.id
                 join app.sources s on s.id = cs.source_id
                where c.idea_version_id = v.id
                order by c.created_at, cs.citation_order
                limit 1) as source_title,
              (select s.source_type
                 from app.claims c
                 join app.claim_sources cs on cs.claim_id = c.id
                 join app.sources s on s.id = cs.source_id
                where c.idea_version_id = v.id
                order by c.created_at, cs.citation_order
                limit 1) as source_type
         from app.ideas i
         join app.idea_versions v on v.id = i.current_published_version_id
        order by v.published_at desc`,
    );
    return result.rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      oneLineSummary: row.one_line_summary,
      language: row.language,
      publishedAt: row.published_at,
      claimCounts: row.claim_counts ?? {},
      sourceTitle: row.source_title,
      sourceType: row.source_type,
    }));
  });
}

export interface PublicClaim {
  id: string;
  type: string;
  statement: string;
  validationStatus: string;
  rationale: string | null;
  citations: { title: string; urlOrReference: string; license: string | null }[];
}

export interface PublicIdea {
  slug: string;
  versionNumber: number;
  language: string;
  contentLicense: string;
  publishedAt: string;
  content: CandidateContent;
  claims: PublicClaim[];
  credits: { displayName: string; contribution: string | null }[];
}

export async function getPublishedIdea(slug: string): Promise<PublicIdea | null> {
  return withDbRole("anonymous", null, async (tx) => {
    const version = await tx.query<{
      id: string;
      slug: string;
      version_number: number;
      language: string;
      content_license: string;
      published_at: string;
      content: CandidateContent;
    }>(
      `select v.id, i.slug, v.version_number, v.language, v.content_license, v.published_at, v.content
         from app.ideas i
         join app.idea_versions v on v.id = i.current_published_version_id
        where i.slug = $1`,
      [slug],
    );
    const row = version.rows[0];
    if (!row) return null;

    const claims = await tx.query<{
      id: string;
      claim_type: string;
      statement: string;
      validation_status: string;
      rationale: string | null;
      citations:
        | { title: string; url_or_reference: string; license: string | null }[]
        | null;
    }>(
      `select c.id, c.claim_type::text, c.statement, c.validation_status::text, c.rationale,
              (select jsonb_agg(jsonb_build_object(
                        'title', s.title,
                        'url_or_reference', s.url_or_reference,
                        'license', s.license)
                      order by cs.citation_order)
                 from app.claim_sources cs
                 join app.sources s on s.id = cs.source_id
                where cs.claim_id = c.id) as citations
         from app.claims c
        where c.idea_version_id = $1
        order by c.created_at`,
      [row.id],
    );

    const credits = await tx.query<{ display_name: string; contribution: string | null }>(
      `select display_name, contribution
         from app.idea_version_credits
        where idea_version_id = $1
        order by credit_order`,
      [row.id],
    );

    return {
      slug: row.slug,
      versionNumber: row.version_number,
      language: row.language,
      contentLicense: row.content_license,
      publishedAt: row.published_at,
      content: row.content,
      claims: claims.rows.map((claim) => ({
        id: claim.id,
        type: claim.claim_type,
        statement: claim.statement,
        validationStatus: claim.validation_status,
        rationale: claim.rationale,
        citations: (claim.citations ?? []).map((citation) => ({
          title: citation.title,
          urlOrReference: citation.url_or_reference,
          license: citation.license,
        })),
      })),
      credits: credits.rows.map((credit) => ({
        displayName: credit.display_name,
        contribution: credit.contribution,
      })),
    };
  });
}

/* ---------- Espace éditorial ---------- */

export interface EditorialCaseSummary {
  intakeId: string;
  title: string;
  inputMode: string;
  rightsBasis: string;
  createdBy: string;
  createdAt: string;
  revision: number;
  generationState: TerminalState | "pending" | "running" | null;
  candidateId: string | null;
  candidateStatus: string | null;
  publishedSlug: string | null;
}

export async function listEditorialCases(
  identity: SyntheticIdentity,
): Promise<EditorialCaseSummary[]> {
  if (!identity.authUserId) return [];
  return withDbRole("authenticated", identity.authUserId, async (tx) => {
    const result = await tx.query<{
      intake_id: string;
      title: string;
      input_mode: string;
      rights_basis: string;
      created_by: string;
      created_at: string;
      revision: string;
      generation_status: string | null;
      terminal_state: TerminalState | null;
      candidate_id: string | null;
      candidate_status: string | null;
      published_slug: string | null;
    }>(
      `select s.id as intake_id, s.title, s.input_mode::text, s.rights_basis::text,
              s.created_by, s.created_at, s.revision,
              g.status::text as generation_status, g.terminal_state::text as terminal_state,
              c.id as candidate_id, c.status::text as candidate_status,
              i.slug as published_slug
         from app.source_intakes s
         left join lateral (
             select * from app.ai_generations g
              where g.source_intake_id = s.id
              order by g.created_at desc limit 1) g on true
         left join lateral (
             select * from app.editorial_candidates c
              where c.source_intake_id = s.id
              order by c.created_at desc limit 1) c on true
         left join app.idea_versions v on v.id = c.published_idea_version_id
         left join app.ideas i on i.id = v.idea_id
        order by s.created_at desc`,
    );
    return result.rows.map((row) => ({
      intakeId: row.intake_id,
      title: row.title,
      inputMode: row.input_mode,
      rightsBasis: row.rights_basis,
      createdBy: row.created_by,
      createdAt: row.created_at,
      revision: Number(row.revision),
      generationState:
        row.generation_status === null
          ? null
          : row.generation_status === "terminal"
            ? row.terminal_state
            : (row.generation_status as "pending" | "running"),
      candidateId: row.candidate_id,
      candidateStatus: row.candidate_status,
      publishedSlug: row.published_slug,
    }));
  });
}

export interface GenerationAttemptView {
  rank: number;
  routeKey: string;
  outcome: string;
  fallbackReason: string | null;
  quotaUnits: number;
  startedAt: string;
  completedAt: string;
}

export interface GenerationView {
  id: string;
  status: "pending" | "running" | "terminal";
  terminalState: TerminalState | null;
  controls: {
    schemaValid?: boolean;
    citationsValid?: boolean;
    prudenceValid?: boolean;
    reasonCode?: string | null;
    simulated?: boolean;
  };
  createdAt: string;
  completedAt: string | null;
  attempts: GenerationAttemptView[];
}

export interface ReviewDecisionView {
  id: string;
  decision: "approved" | "rejected";
  reason: string;
  reviewerId: string;
  candidateRevision: number;
  selfApproval: boolean;
  createdAt: string;
}

export interface EditorialCaseDetail {
  intakeId: string;
  title: string;
  inputMode: "url" | "text";
  sourceUrl: string | null;
  publishedAt: string | null;
  accessedAt: string;
  fingerprint: string;
  excerpts: SourceExcerpt[];
  rightsBasis: string;
  rightsNote: string | null;
  hasTemporaryText: boolean;
  createdBy: string;
  createdAt: string;
  revision: number;
  decidedAt: string | null;
  generation: GenerationView | null;
  candidate: {
    id: string;
    status: string;
    createdBy: string;
    currentRevision: number;
    content: CandidateContent;
    publishedVersionId: string | null;
  } | null;
  decisions: ReviewDecisionView[];
  publishedSlug: string | null;
}

export async function getEditorialCase(
  identity: SyntheticIdentity,
  intakeId: string,
): Promise<EditorialCaseDetail | null> {
  if (!identity.authUserId) return null;
  return withDbRole("authenticated", identity.authUserId, async (tx) => {
    const intake = await tx.query<{
      id: string;
      title: string;
      input_mode: "url" | "text";
      source_url: string | null;
      published_at: string | null;
      accessed_at: string;
      fingerprint_sha256: string;
      excerpts: SourceExcerpt[];
      rights_basis: string;
      rights_note: string | null;
      has_temp_text: boolean;
      created_by: string;
      created_at: string;
      revision: string;
      decided_at: string | null;
    }>(
      `select id, title, input_mode::text as input_mode, source_url, published_at, accessed_at,
              fingerprint_sha256, excerpts, rights_basis::text as rights_basis, rights_note,
              full_text is not null as has_temp_text, created_by, created_at, revision, decided_at
         from app.source_intakes where id = $1`,
      [intakeId],
    );
    const row = intake.rows[0];
    if (!row) return null;

    const generations = await tx.query<{
      id: string;
      status: "pending" | "running" | "terminal";
      terminal_state: TerminalState | null;
      controls: GenerationView["controls"];
      created_at: string;
      completed_at: string | null;
    }>(
      `select id, status::text as status, terminal_state::text as terminal_state,
              controls, created_at, completed_at
         from app.ai_generations
        where source_intake_id = $1
        order by created_at desc limit 1`,
      [intakeId],
    );

    let generation: GenerationView | null = null;
    if (generations.rows[0]) {
      const generationRow = generations.rows[0];
      const attempts = await tx.query<{
        attempt_rank: number;
        route_key: string;
        outcome: string;
        fallback_reason: string | null;
        quota_units: number;
        started_at: string;
        completed_at: string;
      }>(
        `select attempt_rank, route_key, outcome::text as outcome, fallback_reason,
                quota_units, started_at, completed_at
           from app.ai_generation_attempts
          where generation_id = $1
          order by attempt_rank`,
        [generationRow.id],
      );
      generation = {
        id: generationRow.id,
        status: generationRow.status,
        terminalState: generationRow.terminal_state,
        controls: generationRow.controls ?? {},
        createdAt: generationRow.created_at,
        completedAt: generationRow.completed_at,
        attempts: attempts.rows.map((attempt) => ({
          rank: attempt.attempt_rank,
          routeKey: attempt.route_key,
          outcome: attempt.outcome,
          fallbackReason: attempt.fallback_reason,
          quotaUnits: attempt.quota_units,
          startedAt: attempt.started_at,
          completedAt: attempt.completed_at,
        })),
      };
    }

    const candidates = await tx.query<{
      id: string;
      status: string;
      created_by: string;
      current_revision: string;
      published_idea_version_id: string | null;
      content: CandidateContent;
    }>(
      `select c.id, c.status::text as status, c.created_by, c.current_revision,
              c.published_idea_version_id, r.content
         from app.editorial_candidates c
         join app.candidate_revisions r
           on r.candidate_id = c.id and r.revision = c.current_revision
        where c.source_intake_id = $1
        order by c.created_at desc limit 1`,
      [intakeId],
    );
    const candidateRow = candidates.rows[0] ?? null;

    let decisions: ReviewDecisionView[] = [];
    let publishedSlug: string | null = null;
    if (candidateRow) {
      const decisionRows = await tx.query<{
        id: string;
        decision: "approved" | "rejected";
        reason: string;
        reviewer_id: string;
        candidate_revision: string;
        self_approval: boolean;
        created_at: string;
      }>(
        `select id, decision::text as decision, reason, reviewer_id,
                candidate_revision, self_approval, created_at
           from app.review_decisions
          where candidate_id = $1
          order by created_at desc`,
        [candidateRow.id],
      );
      decisions = decisionRows.rows.map((decision) => ({
        id: decision.id,
        decision: decision.decision,
        reason: decision.reason,
        reviewerId: decision.reviewer_id,
        candidateRevision: Number(decision.candidate_revision),
        selfApproval: decision.self_approval,
        createdAt: decision.created_at,
      }));

      if (candidateRow.published_idea_version_id) {
        const slug = await tx.query<{ slug: string }>(
          `select i.slug from app.idea_versions v
             join app.ideas i on i.id = v.idea_id
            where v.id = $1`,
          [candidateRow.published_idea_version_id],
        );
        publishedSlug = slug.rows[0]?.slug ?? null;
      }
    }

    return {
      intakeId: row.id,
      title: row.title,
      inputMode: row.input_mode,
      sourceUrl: row.source_url,
      publishedAt: row.published_at,
      accessedAt: row.accessed_at,
      fingerprint: row.fingerprint_sha256,
      excerpts: row.excerpts,
      rightsBasis: row.rights_basis,
      rightsNote: row.rights_note,
      hasTemporaryText: row.has_temp_text,
      createdBy: row.created_by,
      createdAt: row.created_at,
      revision: Number(row.revision),
      decidedAt: row.decided_at,
      generation,
      candidate: candidateRow
        ? {
            id: candidateRow.id,
            status: candidateRow.status,
            createdBy: candidateRow.created_by,
            currentRevision: Number(candidateRow.current_revision),
            content: candidateRow.content,
            publishedVersionId: candidateRow.published_idea_version_id,
          }
        : null,
      decisions,
      publishedSlug,
    };
  });
}
