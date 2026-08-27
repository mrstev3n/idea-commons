begin;

create function app.runtime_identity()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'authUserId', app.current_auth_user_id(),
    'memberId', m.id,
    'roles', coalesce((
      select jsonb_agg(r.role order by r.role)
      from app.member_role_assignments r where r.member_id=m.id
    ), '[]'::jsonb)
  )
  from (select app.current_auth_user_id() auth_user_id) identity
  left join app.members m on m.auth_user_id=identity.auth_user_id
$$;

create function app.runtime_source_by_fingerprint(target_fingerprint text)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.id from app.source_intakes s
  where s.fingerprint_sha256=target_fingerprint
    and (s.created_by=app.current_member_id() or app.can_review())
  limit 1
$$;

create function app.runtime_source_to_idea_skill_version()
returns uuid language sql stable security definer set search_path = '' as $$
  select v.id from app.prompt_skill_versions v
  join app.prompt_skills s on s.id=v.skill_id
  where s.slug='source-to-idea' and v.version='1.0.0' and v.published_at is not null
$$;

create function app.runtime_publication_receipt(target_version_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ideaVersionId',v.id,'slug',i.slug,'publishedAt',v.published_at)
  from app.idea_versions v join app.ideas i on i.id=v.idea_id
  where v.id=target_version_id and app.can_review()
$$;

create function app.runtime_list_published_ideas()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',q.slug,'title',q.title,'oneLineSummary',q.one_line_summary,'language',q.language,
    'publishedAt',q.published_at,'claimCounts',coalesce(q.claim_counts,'{}'::jsonb),
    'sourceTitle',q.source_title,'sourceType',q.source_type
  ) order by q.published_at desc),'[]'::jsonb)
  from (
    select i.slug,v.content->>'title' title,v.content->>'oneLineSummary' one_line_summary,
      v.language,v.published_at,
      (select jsonb_object_agg(claim_type,total) from (
        select c.claim_type::text claim_type,count(*) total from app.claims c
        where c.idea_version_id=v.id group by c.claim_type
      ) counts) claim_counts,
      (select s.title from app.claims c join app.claim_sources cs on cs.claim_id=c.id
       join app.sources s on s.id=cs.source_id where c.idea_version_id=v.id
       order by c.created_at,cs.citation_order limit 1) source_title,
      (select s.source_type from app.claims c join app.claim_sources cs on cs.claim_id=c.id
       join app.sources s on s.id=cs.source_id where c.idea_version_id=v.id
       order by c.created_at,cs.citation_order limit 1) source_type
    from app.ideas i join app.idea_versions v on v.id=i.current_published_version_id
  ) q
$$;

create function app.runtime_get_published_idea(target_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slug',i.slug,'versionNumber',v.version_number,'language',v.language,
    'contentLicense',v.content_license,'publishedAt',v.published_at,'content',v.content,
    'claims',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'type',c.claim_type,'statement',c.statement,'validationStatus',c.validation_status,
      'rationale',c.rationale,'citations',coalesce((select jsonb_agg(jsonb_build_object(
        'title',s.title,'urlOrReference',s.url_or_reference,'license',s.license
      ) order by cs.citation_order) from app.claim_sources cs join app.sources s on s.id=cs.source_id
        where cs.claim_id=c.id),'[]'::jsonb)
    ) order by c.created_at) from app.claims c where c.idea_version_id=v.id),'[]'::jsonb),
    'credits',coalesce((select jsonb_agg(jsonb_build_object(
      'displayName',cr.display_name,'contribution',cr.contribution
    ) order by cr.credit_order) from app.idea_version_credits cr where cr.idea_version_id=v.id),'[]'::jsonb)
  )
  from app.ideas i join app.idea_versions v on v.id=i.current_published_version_id
  where i.slug=target_slug
$$;

create function app.runtime_list_editorial_cases()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'intakeId',s.id,'title',s.title,'inputMode',s.input_mode,'rightsBasis',s.rights_basis,
    'createdBy',s.created_by,'createdAt',s.created_at,'revision',s.revision,
    'generationState',case when g.status is null then null when g.status='terminal' then g.terminal_state::text else g.status::text end,
    'candidateId',c.id,'candidateStatus',c.status,'publishedSlug',i.slug
  ) order by s.created_at desc),'[]'::jsonb)
  from app.source_intakes s
  left join lateral (select * from app.ai_generations x where x.source_intake_id=s.id order by x.created_at desc limit 1) g on true
  left join lateral (select * from app.editorial_candidates x where x.source_intake_id=s.id order by x.created_at desc limit 1) c on true
  left join app.idea_versions v on v.id=c.published_idea_version_id
  left join app.ideas i on i.id=v.idea_id
  where s.created_by=app.current_member_id() or app.can_review()
$$;

create function app.runtime_get_editorial_case(target_intake_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'intakeId',s.id,'title',s.title,'inputMode',s.input_mode,'sourceUrl',s.source_url,
    'publishedAt',s.published_at,'accessedAt',s.accessed_at,'fingerprint',s.fingerprint_sha256,
    'excerpts',s.excerpts,'rightsBasis',s.rights_basis,'rightsNote',s.rights_note,
    'hasTemporaryText',s.full_text is not null,'createdBy',s.created_by,'createdAt',s.created_at,
    'revision',s.revision,'decidedAt',s.decided_at,
    'generation',case when g.id is null then null else jsonb_build_object(
      'id',g.id,'status',g.status,'terminalState',g.terminal_state,'controls',g.controls,
      'createdAt',g.created_at,'completedAt',g.completed_at,
      'attempts',coalesce((select jsonb_agg(jsonb_build_object(
        'rank',a.attempt_rank,'routeKey',a.route_key,'outcome',a.outcome,
        'fallbackReason',a.fallback_reason,'quotaUnits',a.quota_units,
        'startedAt',a.started_at,'completedAt',a.completed_at
      ) order by a.attempt_rank) from app.ai_generation_attempts a where a.generation_id=g.id),'[]'::jsonb)
    ) end,
    'candidate',case when c.id is null then null else jsonb_build_object(
      'id',c.id,'status',c.status,'createdBy',c.created_by,'currentRevision',c.current_revision,
      'content',r.content,'publishedVersionId',c.published_idea_version_id
    ) end,
    'decisions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'decision',d.decision,'reason',d.reason,'reviewerId',d.reviewer_id,
      'candidateRevision',d.candidate_revision,'selfApproval',d.self_approval,'createdAt',d.created_at
    ) order by d.created_at) from app.review_decisions d where d.candidate_id=c.id),'[]'::jsonb),
    'publishedSlug',i.slug
  )
  from app.source_intakes s
  left join lateral (select * from app.ai_generations x where x.source_intake_id=s.id order by x.created_at desc limit 1) g on true
  left join lateral (select * from app.editorial_candidates x where x.source_intake_id=s.id order by x.created_at desc limit 1) c on true
  left join app.candidate_revisions r on r.candidate_id=c.id and r.revision=c.current_revision
  left join app.idea_versions v on v.id=c.published_idea_version_id
  left join app.ideas i on i.id=v.idea_id
  where s.id=target_intake_id and (s.created_by=app.current_member_id() or app.can_review())
$$;

revoke all on function app.runtime_identity(), app.runtime_source_by_fingerprint(text),
  app.runtime_source_to_idea_skill_version(), app.runtime_publication_receipt(uuid),
  app.runtime_list_published_ideas(), app.runtime_get_published_idea(text),
  app.runtime_list_editorial_cases(), app.runtime_get_editorial_case(uuid) from public, anonymous;
grant execute on function app.runtime_identity(), app.runtime_source_by_fingerprint(text),
  app.runtime_source_to_idea_skill_version(), app.runtime_publication_receipt(uuid),
  app.runtime_list_published_ideas(), app.runtime_get_published_idea(text),
  app.runtime_list_editorial_cases(), app.runtime_get_editorial_case(uuid) to authenticated;

-- La Data API expose le schéma app, mais jamais ses tables directement.
revoke all privileges on all tables in schema app from anonymous, authenticated;

commit;
