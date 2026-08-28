begin;

create function app.public_list_published_ideas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', q.slug,
    'title', q.title,
    'oneLineSummary', q.one_line_summary,
    'language', q.language,
    'publishedAt', q.published_at,
    'claimCounts', coalesce(q.claim_counts, '{}'::jsonb),
    'sourceTitle', q.source_title,
    'sourceType', q.source_type
  ) order by q.published_at desc), '[]'::jsonb)
  from (
    select
      i.slug,
      v.content->>'title' as title,
      v.content->>'oneLineSummary' as one_line_summary,
      v.language,
      v.published_at,
      (
        select jsonb_object_agg(claim_type, total)
        from (
          select c.claim_type::text as claim_type, count(*) as total
          from app.claims as c
          where c.idea_version_id = v.id
          group by c.claim_type
        ) as counts
      ) as claim_counts,
      (
        select s.title
        from app.claims as c
        join app.claim_sources as cs on cs.claim_id = c.id
        join app.sources as s on s.id = cs.source_id
        where c.idea_version_id = v.id
        order by c.created_at, cs.citation_order
        limit 1
      ) as source_title,
      (
        select s.source_type
        from app.claims as c
        join app.claim_sources as cs on cs.claim_id = c.id
        join app.sources as s on s.id = cs.source_id
        where c.idea_version_id = v.id
        order by c.created_at, cs.citation_order
        limit 1
      ) as source_type
    from app.ideas as i
    join app.idea_versions as v on v.id = i.current_published_version_id
    where v.status in ('published', 'needs_review')
      and v.visibility = 'public'
      and v.published_at is not null
  ) as q
$$;

create function app.public_get_published_idea(target_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', i.slug,
    'versionNumber', v.version_number,
    'language', v.language,
    'contentLicense', v.content_license,
    'publishedAt', v.published_at,
    'content', jsonb_build_object(
      'title', v.content->'title',
      'oneLineSummary', v.content->'oneLineSummary',
      'problemStatement', v.content->'problemStatement',
      'targetAudiences', v.content->'targetAudiences',
      'proposedApproach', v.content->'proposedApproach',
      'mvpScope', v.content->'mvpScope',
      'initialExclusions', v.content->'initialExclusions',
      'coreAssumptions', v.content->'coreAssumptions',
      'validationQuestions', v.content->'validationQuestions',
      'risks', v.content->'risks'
    ),
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', c.claim_type,
        'statement', c.statement,
        'rationale', c.rationale,
        'citations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'title', s.title,
            'urlOrReference', s.url_or_reference
          ) order by cs.citation_order)
          from app.claim_sources as cs
          join app.sources as s on s.id = cs.source_id
          where cs.claim_id = c.id
        ), '[]'::jsonb)
      ) order by c.created_at)
      from app.claims as c
      where c.idea_version_id = v.id
    ), '[]'::jsonb),
    'credits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'displayName', cr.display_name,
        'contribution', cr.contribution
      ) order by cr.credit_order)
      from app.idea_version_credits as cr
      where cr.idea_version_id = v.id
    ), '[]'::jsonb)
  )
  from app.ideas as i
  join app.idea_versions as v on v.id = i.current_published_version_id
  where i.slug = target_slug
    and v.status in ('published', 'needs_review')
    and v.visibility in ('public', 'unlisted')
    and v.published_at is not null
$$;

comment on function app.public_list_published_ideas() is
  'Projection anonyme minimale du catalogue: versions publiées avec visibilité public.';
comment on function app.public_get_published_idea(text) is
  'Projection anonyme minimale d une fiche publiée public ou unlisted, résolue par slug.';

revoke all on function app.public_list_published_ideas(),
  app.public_get_published_idea(text) from public, authenticated;
grant execute on function app.public_list_published_ideas(),
  app.public_get_published_idea(text) to anonymous;

-- La projection publique ne restaure aucun accès REST direct aux tables.
revoke all privileges on all tables in schema app from anonymous, authenticated;

commit;
