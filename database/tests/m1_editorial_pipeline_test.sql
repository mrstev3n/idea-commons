begin;

create schema test_m1;
create function test_m1.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'assertion failed: %',message; end if; end $$;
create function test_m1.assert_equal(actual bigint, expected bigint, message text) returns void language plpgsql as $$
begin if actual is distinct from expected then raise exception 'assertion failed: % (expected %, got %)',message,expected,actual; end if; end $$;
create function test_m1.expect_error(command text, message text) returns void language plpgsql as $$
begin execute command; raise exception 'assertion failed: % (command was allowed)',message;
exception when insufficient_privilege or check_violation or unique_violation or serialization_failure or sqlstate '55000' then null; end $$;
create function test_m1.expect_insufficient_privilege(command text, message text) returns void language plpgsql as $$
begin execute command; raise exception 'assertion failed: % (command was allowed)',message;
exception when insufficient_privilege then null; end $$;
create function test_m1.expect_zero_rows(command text, message text) returns void language plpgsql as $$
declare affected bigint; begin execute command; get diagnostics affected=row_count; perform test_m1.assert_equal(affected,0,message); end $$;
grant usage on schema test_m1 to anonymous,authenticated;
grant execute on all functions in schema test_m1 to anonymous,authenticated;

insert into app.members(id,auth_user_id,display_name) values
 ('11000000-0000-0000-0000-000000000001','01000000-0000-0000-0000-000000000001','Contributor synthétique'),
 ('11000000-0000-0000-0000-000000000002','01000000-0000-0000-0000-000000000002','Reviewer synthétique'),
 ('11000000-0000-0000-0000-000000000003','01000000-0000-0000-0000-000000000003','Admin synthétique'),
 ('11000000-0000-0000-0000-000000000004','01000000-0000-0000-0000-000000000004','Étranger synthétique'),
 ('11000000-0000-0000-0000-000000000005','01000000-0000-0000-0000-000000000005','Membre synthétique');
insert into app.member_role_assignments(member_id,role) values
 ('11000000-0000-0000-0000-000000000001','contributor'),
 ('11000000-0000-0000-0000-000000000002','reviewer'),
 ('11000000-0000-0000-0000-000000000003','admin');
insert into app.prompt_skills(id,slug,name) values('12000000-0000-0000-0000-000000000001','source-to-idea','Source vers candidat d’idée');
insert into app.prompt_skill_versions(id,skill_id,version,input_schema,output_schema,instructions,published_at) values
 ('13000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','1.0.0','{}','{}','Contrat synthétique versionné.','2026-08-12T00:00:00Z');
select test_m1.expect_error($q$update app.prompt_skill_versions set instructions='réécriture interdite'$q$,'published skill versions are immutable');

-- Sujet authenticated non mappé : NULL n'est jamais une identité serveur implicite.
insert into app.source_intakes(id,created_by,input_mode,title,accessed_at,fingerprint_sha256,excerpts,rights_basis,rights_note,full_text) values
 ('15000000-0000-0000-0000-000000000006','11000000-0000-0000-0000-000000000001','text','Rétention admin synthétique','2026-08-12T00:00:00Z',repeat('9',64),'[{"id":"unmapped-1","text":"Texte protégé contre un sujet non mappé.","locator":"p1"}]','compatible_license','CC-BY-SA-4.0','secret-canary-non-mappe');
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000099',true); set local role authenticated;
select test_m1.assert_true(app.current_member_id() is null and not app.can_review(),'unmapped authenticated subject has no member identity or reviewer capability');
select test_m1.expect_insufficient_privilege($q$select app.verify_source_retention_rights('15000000-0000-0000-0000-000000000006',1,'preuve non mappée interdite')$q$,'unmapped authenticated subject cannot verify durable retention rights');
reset role;
select test_m1.assert_true((select revision=1 and full_text_retention_status='temporary' and full_text_delete_after is not null and retention_verified_by is null from app.source_intakes where id='15000000-0000-0000-0000-000000000006'),'unmapped subject failure leaves retention state unchanged');
select test_m1.assert_equal((select count(*) from app_private.audit_events where resource_id='15000000-0000-0000-0000-000000000006'),0,'unmapped subject failure leaves no audit event');
select test_m1.assert_equal((select count(*) from app_private.command_receipts where resource_id='15000000-0000-0000-0000-000000000006'),0,'unmapped subject failure leaves no command receipt');
select test_m1.assert_equal((select count(*) from app_private.outbox_events where aggregate_id='15000000-0000-0000-0000-000000000006'),0,'unmapped subject failure leaves no outbox event');

-- Membre ordinaire, anonyme et étranger : aucune capacité éditoriale ni fuite.
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000005',true); set local role authenticated;
select test_m1.expect_error($q$select app.create_source_intake('text','Interdit',null,null,now(),repeat('a',64),'[{"id":"e","text":"x","locator":"p1"}]','temporary_analysis',null,'texte','ordinary-key',repeat('1',64))$q$,'ordinary authenticated member cannot ingest');
reset role;
select set_config('request.jwt.claim.sub','',true); set local role anonymous;
select test_m1.expect_error('select * from app.source_intakes','anonymous cannot query editorial intakes');
reset role;

-- Contributor : ingestion idempotente, conflit de clé et génération outbox sans payload privé.
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000001',true); set local role authenticated;
select test_m1.assert_true(app.can_contribute(),'contributor capability is recognized');
select test_m1.assert_true(not app.can_review(),'contributor never gets review capability');
select test_m1.assert_true(
 app.create_source_intake('text','Source durable synthétique',null,null,'2026-08-12T00:00:00Z',repeat('a',64),'[{"id":"ex-1","text":"Fait synthétique daté.","locator":"paragraphe 1"}]','compatible_license','CC-BY-SA-4.0',null,'intake-durable',repeat('1',64))
 = app.create_source_intake('text','Source durable synthétique',null,null,'2026-08-12T00:00:00Z',repeat('a',64),'[{"id":"ex-1","text":"Fait synthétique daté.","locator":"paragraphe 1"}]','compatible_license','CC-BY-SA-4.0',null,'intake-durable',repeat('1',64)),
 'same idempotency key and fingerprint returns same intake'
);
select test_m1.expect_error($q$select app.create_source_intake('text','Charge différente',null,null,now(),repeat('b',64),'[{"id":"x","text":"x","locator":"p"}]','temporary_analysis',null,'secret-canary','intake-durable',repeat('2',64))$q$,'same key with different fingerprint conflicts');
select test_m1.expect_error($q$select app.create_source_intake('text','Extraits ambigus',null,null,now(),repeat('b',64),'[{"id":"dup","text":"Premier texte","locator":"p1"},{"id":"dup","text":"Second texte différent","locator":"p2"}]','temporary_analysis',null,'texte temporaire','duplicate-excerpts',repeat('a',64))$q$,'two different excerpts cannot share the same id');
select test_m1.assert_equal((select count(*) from app.source_intakes where title='Extraits ambigus'),0,'duplicate excerpt rejection leaves no intake');
select test_m1.assert_true((select fingerprint_status='submitted' and verified_fingerprint_sha256 is null from app.source_intakes where title='Source durable synthétique'),'contributor fingerprint is stored as submitted and unverified');
select test_m1.expect_error($q$select app.record_verified_source_fingerprint((select id from app.source_intakes where title='Source durable synthétique'),1,repeat('b',64))$q$,'contributor cannot verify a source fingerprint');
select test_m1.assert_true(
 app.create_source_intake('text','Droit déclaré non vérifié',null,null,'2026-08-12T00:00:00Z',repeat('b',64),'[{"id":"rights-1","text":"Texte à rétention temporaire.","locator":"p1"}]','compatible_license','CC-BY-SA-4.0','secret-canary-droit-declare','retention-unverified',repeat('b',64)) is not null,
 'declared compatible rights do not block temporary ingestion'
);
select test_m1.assert_true((select full_text_retention_status='temporary' and full_text_delete_after is not null and retention_verified_at is null from app.source_intakes where title='Droit déclaré non vérifié'),'contributor rights declaration never enables durable retention');
select test_m1.expect_insufficient_privilege($q$select app.verify_source_retention_rights((select id from app.source_intakes where title='Droit déclaré non vérifié'),1,'preuve contributor interdite')$q$,'contributor cannot verify durable retention rights');
select test_m1.assert_true((select revision=1 and full_text_retention_status='temporary' and full_text_delete_after is not null and retention_verified_by is null from app.source_intakes where title='Droit déclaré non vérifié'),'contributor failure leaves retention state unchanged');
select test_m1.assert_true(
 app.start_candidate_generation((select id from app.source_intakes where title='Source durable synthétique'),'13000000-0000-0000-0000-000000000001',1,'generation-1',repeat('3',64))
 = app.start_candidate_generation((select id from app.source_intakes where title='Source durable synthétique'),'13000000-0000-0000-0000-000000000001',1,'generation-1',repeat('3',64)),
 'generation command is idempotent'
);
select test_m1.expect_error($q$insert into app.source_intakes(created_by,input_mode,title,accessed_at,fingerprint_sha256,excerpts,rights_basis) values('11000000-0000-0000-0000-000000000001','text','Direct',now(),repeat('c',64),'[{"id":"x"}]','temporary_analysis')$q$,'runtime contributor has no direct insert privilege');
select test_m1.expect_error($q$select app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',1,'interdit','{}','interdit','CC-BY-SA-4.0','Crédit','x',repeat('f',64))$q$,'contributor cannot approve');
reset role;
select test_m1.assert_equal((select count(*) from app_private.audit_events where event_type='source_intake.retention_verified' and resource_id=(select id from app.source_intakes where title='Droit déclaré non vérifié')),0,'contributor failure leaves no retention audit event');
select test_m1.assert_equal((select count(*) from app_private.command_receipts where command_name='verify_source_retention_rights' and resource_id=(select id from app.source_intakes where title='Droit déclaré non vérifié')),0,'contributor failure leaves no retention command receipt');
select test_m1.assert_equal((select count(*) from app_private.outbox_events where aggregate_id=(select id from app.source_intakes where title='Droit déclaré non vérifié')),0,'contributor failure leaves no retention outbox event');

-- Empreinte : la déclaration reste séparée d'une vérification serveur immuable, sans pgcrypto.
select set_config('request.jwt.claim.sub','',true);
insert into app.source_intakes(id,created_by,input_mode,title,accessed_at,fingerprint_sha256,excerpts,rights_basis) values
 ('15000000-0000-0000-0000-000000000005','11000000-0000-0000-0000-000000000001','text','Source à empreinte vérifiée','2026-08-12T00:00:00Z',repeat('c',64),'[{"id":"fp-1","text":"Contenu canonique synthétique.","locator":"p1"}]','idea_commons');
select test_m1.assert_equal(app.record_verified_source_fingerprint('15000000-0000-0000-0000-000000000005',1,repeat('d',64)),2,'trusted server records a separately derived fingerprint');
select test_m1.assert_true((select fingerprint_status='verified' and fingerprint_sha256=repeat('c',64) and verified_fingerprint_sha256=repeat('d',64) and fingerprint_verification_method='unicode_nfc_lf_trim_v1' from app.source_intakes where id='15000000-0000-0000-0000-000000000005'),'submitted and verified fingerprints remain explicitly distinct');
select test_m1.expect_error($q$update app.source_intakes set verified_fingerprint_sha256=repeat('e',64),revision=revision+1 where id='15000000-0000-0000-0000-000000000005'$q$,'verified fingerprint evidence is immutable');
select test_m1.expect_error($q$update app.source_intakes set excerpts='[{"id":"fp-1","text":"Texte remplacé","locator":"p1"}]',revision=revision+1 where id='15000000-0000-0000-0000-000000000005'$q$,'source excerpts are immutable after ingestion');
select test_m1.assert_equal((select count(*) from pg_extension where extname='pgcrypto'),0,'M1-A does not silently add pgcrypto');

-- Fixtures server-side representing validated simulator output.
insert into app.editorial_candidates(id,source_intake_id,generation_id,created_by,status,current_revision) values
 ('14000000-0000-0000-0000-000000000001',(select id from app.source_intakes where title='Source durable synthétique'),(select id from app.ai_generations limit 1),'11000000-0000-0000-0000-000000000001','draft',1);
insert into app.candidate_revisions(candidate_id,revision,content,changed_by,change_summary,schema_valid,citations_valid,prudence_valid) values
 ('14000000-0000-0000-0000-000000000001',1,'{"title":"Répertoire synthétique","oneLineSummary":"Résumé prudent","problemStatement":"Fait synthétique daté.","targetAudiences":["public fictif"],"proposedApproach":"Tester manuellement.","mvpScope":["un quartier fictif"],"initialExclusions":["paiement"],"coreAssumptions":["participation à tester"],"validationQuestions":["Qui participerait ?"],"risks":["donnée obsolète"],"claims":[{"type":"fact","statement":"Fait synthétique daté.","rationale":null,"citationExcerptIds":["ex-1"]},{"type":"hypothesis","statement":"La consultation serait utile.","rationale":null,"citationExcerptIds":[]}]}','11000000-0000-0000-0000-000000000001','Sortie simulée initiale',true,true,true);
select test_m1.expect_error($q$insert into app.candidate_revisions(candidate_id,revision,content,changed_by,change_summary,schema_valid,citations_valid,prudence_valid) values('14000000-0000-0000-0000-000000000001',2,'{"claims":[{"type":"fact","statement":"Sans preuve","citationExcerptIds":[]}]}','11000000-0000-0000-0000-000000000001','Invalide',true,false,true)$q$,'factual claim without citation is refused');
select test_m1.expect_error($q$insert into app.candidate_revisions(candidate_id,revision,content,changed_by,change_summary,schema_valid,citations_valid,prudence_valid) values('14000000-0000-0000-0000-000000000001',2,'{}','11000000-0000-0000-0000-000000000001','Schéma incomplet',true,true,true)$q$,'incomplete candidate schema is refused');
select test_m1.expect_error($q$insert into app.candidate_revisions(candidate_id,revision,content,changed_by,change_summary,schema_valid,citations_valid,prudence_valid) select '14000000-0000-0000-0000-000000000001',2,jsonb_set(content,'{claims,0}','{"statement":"Type absent","citationExcerptIds":[]}'::jsonb),'11000000-0000-0000-0000-000000000001','Claim sans type',true,true,true from app.candidate_revisions where candidate_id='14000000-0000-0000-0000-000000000001' and revision=1$q$,'claim without explicit type is refused');
insert into app.editorial_candidates(id,source_intake_id,created_by,status,current_revision) values
 ('14000000-0000-0000-0000-000000000007',(select id from app.source_intakes where title='Source durable synthétique'),'11000000-0000-0000-0000-000000000001','draft',1);
insert into app.candidate_revisions(candidate_id,revision,content,changed_by,change_summary,schema_valid,citations_valid,prudence_valid)
select '14000000-0000-0000-0000-000000000007',1,jsonb_set(content,'{claims,0,citationExcerptIds}','["missing-excerpt"]'::jsonb),'11000000-0000-0000-0000-000000000001','Citation absente de la source',true,true,true
from app.candidate_revisions where candidate_id='14000000-0000-0000-0000-000000000001' and revision=1;
select test_m1.expect_error($q$insert into app.review_decisions(candidate_id,candidate_revision,reviewer_id,decision,reason,checklist,self_approval) values('14000000-0000-0000-0000-000000000001',1,'11000000-0000-0000-0000-000000000002','approved','Contournement direct','{}',false)$q$,'approved decision cannot bypass the strict checklist constraint');

-- Contributor corrige seulement son candidat ; étranger ne voit rien.
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000001',true); set local role authenticated;
select test_m1.assert_equal((select count(*) from app.editorial_candidates),2,'contributor sees only own candidates');
select test_m1.assert_equal(app.update_candidate_draft('14000000-0000-0000-0000-000000000001',1,(select content from app.candidate_revisions where candidate_id='14000000-0000-0000-0000-000000000001' and revision=1),'Correction synthétique'),2,'contributor advances optimistic revision');
select test_m1.expect_error($q$select app.update_candidate_draft('14000000-0000-0000-0000-000000000001',1,'{}','Révision périmée')$q$,'stale revision conflicts');
reset role;
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000004',true); set local role authenticated;
select test_m1.assert_equal((select count(*) from app.source_intakes),0,'stranger sees no intake');
select test_m1.assert_equal((select count(*) from app.editorial_candidates),0,'stranger sees no candidate');
reset role;

-- Publication : citations exactes, checklist stricte et aucun effet partiel.
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000002',true); set local role authenticated;
select test_m1.assert_true(app.can_review(),'reviewer capability is recognized');
select test_m1.expect_error($q$select app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000007',1,'Citation absente','{"rights":true,"citations":true,"prudence":true}','citation-absente','CC-BY-SA-4.0','Crédit','publish-missing-excerpt',repeat('0',64))$q$,'factual citation must resolve exactly one immutable source excerpt');
select test_m1.expect_error($q$select app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',2,'Revue synthétique','{"rights":true,"citations":true}','repertoire-synthetique','','Crédit','publish-bad-license',repeat('4',64))$q$,'missing license refuses publication');
select test_m1.expect_error($q$select app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',2,'Revue synthétique','{"rights":true,"citations":true}','repertoire-synthetique','CC-BY-SA-4.0','','publish-bad-credit',repeat('5',64))$q$,'missing credit refuses publication');
select test_m1.expect_error($q$select app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',2,'Revue synthétique','{}','repertoire-synthetique','CC-BY-SA-4.0','Crédit','publish-empty-checklist',repeat('1',64))$q$,'empty publication checklist refuses publication');
select test_m1.expect_error($q$select app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',2,'Revue synthétique','null','repertoire-synthetique','CC-BY-SA-4.0','Crédit','publish-null-checklist',repeat('2',64))$q$,'JSON null publication checklist refuses publication');
select test_m1.expect_error($q$select app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',2,'Revue synthétique','{"rights":true,"citations":true}','repertoire-synthetique','CC-BY-SA-4.0','Crédit','publish-missing-key',repeat('3',64))$q$,'missing checklist key refuses publication');
select test_m1.expect_error($q$select app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',2,'Revue synthétique','{"rights":true,"citations":true,"prudence":false}','repertoire-synthetique','CC-BY-SA-4.0','Crédit','publish-false-checklist',repeat('4',64))$q$,'false checklist value refuses publication');
select test_m1.expect_error($q$select app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',2,'Revue synthétique','{"rights":"true","citations":true,"prudence":true}','repertoire-synthetique','CC-BY-SA-4.0','Crédit','publish-string-checklist',repeat('5',64))$q$,'wrong checklist value type refuses publication');
select test_m1.expect_error($q$select app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',2,'Revue synthétique','{"rights":true,"citations":true,"prudence":true,"extra":true}','repertoire-synthetique','CC-BY-SA-4.0','Crédit','publish-extra-checklist',repeat('6',64))$q$,'extra checklist key refuses publication');
select test_m1.assert_equal((select count(*) from app.ideas),0,'failed publications leave no idea');
select test_m1.assert_equal((select count(*) from app.idea_versions),0,'failed publications leave no idea version');
select test_m1.assert_equal((select count(*) from app.sources),0,'failed publications leave no public source');
select test_m1.assert_equal((select count(*) from app.claims),0,'failed publications leave no public claim');
select test_m1.assert_equal((select count(*) from app.review_decisions),0,'failed publications leave no review decision');
reset role;
select set_config('request.jwt.claim.sub','',true);
select test_m1.assert_equal((select count(*) from app_private.command_receipts where command_name='approve_and_publish_candidate'),0,'failed publications leave no command receipt');
select test_m1.assert_equal((select count(*) from app_private.audit_events where event_type='candidate.published'),0,'failed publications leave no publication audit event');
select test_m1.assert_equal((select count(*) from app_private.outbox_events where topic='editorial.idea.published'),0,'failed publications leave no publication outbox event');
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000002',true); set local role authenticated;
select test_m1.assert_true(app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',2,'Revue humaine synthétique','{"rights":true,"citations":true,"prudence":true}','repertoire-synthetique','CC-BY-SA-4.0','Équipe éditoriale synthétique','publish-ok',repeat('6',64)) is not null,'reviewer publishes valid candidate atomically');
select test_m1.assert_true(app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',2,'Revue humaine synthétique','{"rights":true,"citations":true,"prudence":true}','repertoire-synthetique','CC-BY-SA-4.0','Équipe éditoriale synthétique','publish-ok',repeat('6',64))=(select published_idea_version_id from app.editorial_candidates where id='14000000-0000-0000-0000-000000000001'),'exact approval replay returns the same publication');
select test_m1.assert_true(not (select self_approval from app.review_decisions where candidate_id='14000000-0000-0000-0000-000000000001'),'separate reviewer is not self-approval');
select test_m1.assert_true((select s.license='CC-BY-SA-4.0' and s.notes='Source éditoriale vérifiée' and s.url_or_reference ~ '^urn:idea-commons:source:[0-9a-f-]{36}$' and position((select fingerprint_sha256 from app.source_intakes where title='Source durable synthétique') in s.url_or_reference)=0 from app.sources s join app.claim_sources cs on cs.source_id=s.id join app.claims c on c.id=cs.claim_id join app.idea_versions v on v.id=c.idea_version_id join app.ideas i on i.id=v.idea_id where i.slug='repertoire-synthetique' limit 1),'public source uses a server-owned opaque reference, never the submitted fingerprint as proof');
select test_m1.expect_error($q$select app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000001',2,'Décision concurrente','{"rights":true,"citations":true,"prudence":true}','seconde-publication','CC-BY-SA-4.0','Équipe éditoriale synthétique','publish-second-winner',repeat('7',64))$q$,'a second approval cannot win for the same candidate revision');
select test_m1.expect_error($q$select app.reject_candidate('14000000-0000-0000-0000-000000000001',2,'Décision contradictoire','{"rights":false}')$q$,'approval and rejection cannot both win for the same candidate revision');
select test_m1.assert_equal((select count(*) from app.review_decisions where candidate_id='14000000-0000-0000-0000-000000000001' and candidate_revision=2),1,'exactly one terminal decision exists for the published revision');
select test_m1.assert_equal((select count(*) from app.idea_versions where id=(select published_idea_version_id from app.editorial_candidates where id='14000000-0000-0000-0000-000000000001')),1,'at most one public version survives terminal decision races');
select test_m1.expect_error($q$update app.review_decisions set reason='réécrit'$q$,'review decisions are append-only');
reset role;
select set_config('request.jwt.claim.sub','',true);
select test_m1.assert_equal((select count(*) from app_private.outbox_events where topic='editorial.idea.published' and payload->>'candidate_id'='14000000-0000-0000-0000-000000000001'),1,'at most one publication outbox event survives');

-- Version, relations et slug sont immuables ; anonyme lit seulement la projection publique M0.
select test_m1.expect_error($q$update app.idea_versions set content='{}' where id=(select current_published_version_id from app.ideas where slug='repertoire-synthetique')$q$,'published version content is immutable');
select test_m1.expect_error($q$update app.ideas set slug='slug-modifie' where slug='repertoire-synthetique'$q$,'published slug is immutable');
select test_m1.expect_error($q$delete from app.claim_sources where claim_id in(select c.id from app.claims c join app.idea_versions v on v.id=c.idea_version_id join app.ideas i on i.id=v.idea_id where i.slug='repertoire-synthetique')$q$,'published citations are immutable');
select set_config('request.jwt.claim.sub','',true); set local role anonymous;
select test_m1.assert_equal((select count(*) from app.ideas where slug='repertoire-synthetique'),1,'anonymous reads public idea');
select test_m1.expect_error('select * from app.editorial_candidates','anonymous cannot read candidates');
reset role;

-- Admin peut cumuler ; auto-décision est explicitement signalée.
insert into app.source_intakes(id,created_by,input_mode,title,accessed_at,fingerprint_sha256,excerpts,rights_basis,rights_note) values
 ('15000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003','text','Source admin synthétique','2026-08-12T00:00:00Z',repeat('d',64),'[{"id":"ex-1","text":"Observation admin synthétique.","locator":"p1"}]','compatible_license','CC-BY-SA-4.0');
insert into app.editorial_candidates(id,source_intake_id,created_by,status,current_revision) values('14000000-0000-0000-0000-000000000003','15000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003','draft',1);
insert into app.candidate_revisions(candidate_id,revision,content,changed_by,change_summary,schema_valid,citations_valid,prudence_valid)
select '14000000-0000-0000-0000-000000000003',1,jsonb_set(content,'{title}','"Idée admin synthétique"'),'11000000-0000-0000-0000-000000000003','Fixture admin',true,true,true from app.candidate_revisions where candidate_id='14000000-0000-0000-0000-000000000001' and revision=1;
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000003',true); set local role authenticated;
select test_m1.assert_true(app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000003',1,'Auto-approbation alpha synthétique','{"rights":true,"citations":true,"prudence":true}','idee-admin-synthetique','CC-BY-SA-4.0','Admin synthétique','admin-publish',repeat('7',64)) is not null,'admin may self-approve in alpha');
select test_m1.assert_true((select self_approval from app.review_decisions where candidate_id='14000000-0000-0000-0000-000000000003'),'admin self-approval is flagged');
reset role;

-- Collision de slug : suffixe court stable dérivé de l'identifiant, jamais compteur concurrent.
insert into app.source_intakes(id,created_by,input_mode,title,accessed_at,fingerprint_sha256,excerpts,rights_basis,rights_note) values
 ('15000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','text','Source collision synthétique','2026-08-12T00:00:00Z',repeat('f',64),'[{"id":"ex-1","text":"Observation collision synthétique.","locator":"p1"}]','compatible_license','CC-BY-SA-4.0');
insert into app.editorial_candidates(id,source_intake_id,created_by,status,current_revision) values('14000000-0000-0000-0000-000000000004','15000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','draft',1);
insert into app.candidate_revisions(candidate_id,revision,content,changed_by,change_summary,schema_valid,citations_valid,prudence_valid)
select '14000000-0000-0000-0000-000000000004',1,jsonb_set(content,'{title}','"Idée collision synthétique"'),'11000000-0000-0000-0000-000000000003','Fixture collision',true,true,true from app.candidate_revisions where candidate_id='14000000-0000-0000-0000-000000000001' and revision=1;
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000003',true); set local role authenticated;
select test_m1.assert_true(app.approve_and_publish_candidate('14000000-0000-0000-0000-000000000004',1,'Collision contrôlée','{"rights":true,"citations":true,"prudence":true}','idee-admin-synthetique','CC-BY-SA-4.0','Admin synthétique','collision-publish',repeat('8',64)) is not null,'slug collision publishes with stable suffix');
select test_m1.assert_true((select proposed_slug ~ '^idee-admin-synthetique-[0-9a-f]{8}$' from app.editorial_candidates where id='14000000-0000-0000-0000-000000000004'),'collision suffix is short and derived from idea id');
select test_m1.assert_true((select right(proposed_slug,8)=substr(replace(i.id::text,'-',''),1,8) from app.editorial_candidates c join app.idea_versions v on v.id=c.published_idea_version_id join app.ideas i on i.id=v.idea_id where c.id='14000000-0000-0000-0000-000000000004'),'slug suffix matches immutable idea identifier');
reset role;

-- Rétention : seule une transition reviewer/admin distincte autorise le durable.
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000002',true); set local role authenticated;
select test_m1.assert_equal(app.verify_source_retention_rights((select id from app.source_intakes where title='Droit déclaré non vérifié'),1,'Licence compatible vérifiée par reviewer synthétique'),2,'reviewer owns the separate durable retention transition');
select test_m1.assert_true((select full_text_retention_status='durable_verified' and full_text_delete_after is null and retention_verified_by='11000000-0000-0000-0000-000000000002' and full_text is not null from app.source_intakes where title='Droit déclaré non vérifié'),'verified rights enable durable retention without losing text');
reset role;
select test_m1.assert_equal((select count(*) from app_private.audit_events where event_type='source_intake.retention_verified' and resource_id=(select id from app.source_intakes where title='Droit déclaré non vérifié') and actor_member_id='11000000-0000-0000-0000-000000000002'),1,'reviewer retention verification is attributed in audit');
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000003',true); set local role authenticated;
select test_m1.assert_true(app.can_review(),'admin retains reviewer capability');
select test_m1.assert_equal(app.verify_source_retention_rights('15000000-0000-0000-0000-000000000006',1,'Droit vérifié par admin synthétique'),2,'admin may verify durable retention rights');
select test_m1.assert_true((select full_text_retention_status='durable_verified' and full_text_delete_after is null and retention_verified_by='11000000-0000-0000-0000-000000000003' and full_text is not null from app.source_intakes where id='15000000-0000-0000-0000-000000000006'),'admin durable retention records a non-null actor');
reset role;
select test_m1.assert_equal((select count(*) from app_private.audit_events where event_type='source_intake.retention_verified' and resource_id='15000000-0000-0000-0000-000000000006' and actor_member_id='11000000-0000-0000-0000-000000000003'),1,'admin retention verification is attributed in audit');
insert into app.editorial_candidates(id,source_intake_id,created_by,status,current_revision) values
 ('14000000-0000-0000-0000-000000000006',(select id from app.source_intakes where title='Droit déclaré non vérifié'),'11000000-0000-0000-0000-000000000001','draft',1);
insert into app.candidate_revisions(candidate_id,revision,content,changed_by,change_summary,schema_valid,citations_valid,prudence_valid)
select '14000000-0000-0000-0000-000000000006',1,jsonb_set(jsonb_set(content,'{title}','"Rétention vérifiée synthétique"'),'{claims,0,citationExcerptIds}','["rights-1"]'::jsonb),'11000000-0000-0000-0000-000000000001','Fixture rétention vérifiée',true,true,true
from app.candidate_revisions where candidate_id='14000000-0000-0000-0000-000000000001' and revision=1;
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000002',true); set local role authenticated;
select test_m1.assert_true(app.reject_candidate('14000000-0000-0000-0000-000000000006',1,'Rejet après vérification des droits','{"rights":true}') is not null,'reviewer rejects a source previously verified for durable retention');
reset role;
select test_m1.assert_true((select full_text_retention_status='temporary' and retention_verified_at is null and full_text_delete_after between decided_at and decided_at+interval '7 days' from app.source_intakes where title='Droit déclaré non vérifié'),'rejection always revokes durable retention and schedules deletion by day seven');

-- Texte temporaire : décision planifie au plus tard J+7, purge serveur retire le texte.
insert into app.source_intakes(id,created_by,input_mode,title,accessed_at,fingerprint_sha256,excerpts,rights_basis,full_text) values
 ('15000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','text','Texte temporaire synthétique','2026-08-12T00:00:00Z',repeat('e',64),'[{"id":"tmp","text":"Extrait temporaire.","locator":"p1"}]','temporary_analysis','secret-canary-temporaire');
insert into app.editorial_candidates(id,source_intake_id,created_by,status,current_revision) values('14000000-0000-0000-0000-000000000002','15000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','draft',1);
insert into app.candidate_revisions(candidate_id,revision,content,changed_by,change_summary,schema_valid,citations_valid,prudence_valid)
select '14000000-0000-0000-0000-000000000002',1,content,'11000000-0000-0000-0000-000000000001','Fixture temporaire',true,true,true from app.candidate_revisions where candidate_id='14000000-0000-0000-0000-000000000001' and revision=1;
select set_config('request.jwt.claim.sub','01000000-0000-0000-0000-000000000002',true); set local role authenticated;
select test_m1.assert_true(app.reject_candidate('14000000-0000-0000-0000-000000000002',1,'Droits durables absents','{"rights":false}') is not null,'reviewer rejects temporary source');
reset role;
select test_m1.assert_true((select full_text_delete_after<=decided_at+interval '7 days' from app.source_intakes where id='15000000-0000-0000-0000-000000000002'),'temporary text expires no later than seven days after decision');
select set_config('request.jwt.claim.sub','',true);
select test_m1.assert_equal(app.purge_expired_source_texts(now()+interval '8 days'),2,'server purge removes every rejected full text after its deadline without touching durable admin retention');
select test_m1.assert_true((select full_text is null from app.source_intakes where id='15000000-0000-0000-0000-000000000002'),'expired full text is logically deleted');
select test_m1.assert_true((select full_text is null from app.source_intakes where title='Droit déclaré non vérifié'),'previously verified but rejected full text is also logically deleted');

-- Audit/outbox minimisés, aucun texte intégral, candidat ou secret canari.
select test_m1.assert_equal((select count(*) from app_private.audit_events where metadata::text ~* '(secret-canary|Fait synthétique daté|problemStatement|full_text)'),0,'audit contains no private payload or secret');
select test_m1.assert_equal((select count(*) from app_private.outbox_events where payload::text ~* '(secret-canary|Fait synthétique daté|problemStatement|full_text)'),0,'outbox contains no private payload or secret');

-- Structure et privilèges : RLS partout, aucune écriture directe M1 runtime.
select test_m1.assert_equal((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relkind='r' and not c.relrowsecurity),0,'all app tables have RLS');
select test_m1.assert_equal((select count(*) from information_schema.role_table_grants where grantee in('anonymous','authenticated') and table_schema='app' and table_name in('source_intakes','prompt_skills','prompt_skill_versions','ai_generations','ai_generation_attempts','editorial_candidates','candidate_revisions','review_decisions') and privilege_type in('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES')),0,'runtime roles have no direct M1 write grants');
select test_m1.assert_equal((select count(*) from pg_constraint c where c.contype='f' and c.connamespace in('app'::regnamespace,'app_private'::regnamespace) and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and (i.indkey::smallint[])[0:cardinality(c.conkey)-1]=c.conkey and i.indpred is null)),0,'all foreign keys have a leading index');
select test_m1.assert_equal((select count(*) from pg_constraint where conrelid='app.review_decisions'::regclass and contype='u' and pg_get_constraintdef(oid) like '%(candidate_id, candidate_revision)%'),1,'candidate revision has one unique terminal decision constraint');
select test_m1.assert_true(not has_function_privilege('authenticated','app.record_verified_source_fingerprint(uuid,bigint,text)','execute'),'runtime cannot claim a source fingerprint is verified');
select test_m1.assert_true(has_function_privilege('authenticated','app.verify_source_retention_rights(uuid,bigint,text)','execute'),'reviewer-owned retention transition is callable through its capability guard');

select 'M1 editorial pipeline tests passed' as result;
rollback;
