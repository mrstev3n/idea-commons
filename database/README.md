# Base de données M0 et M1-A

Ce dossier contient les migrations PostgreSQL d'Idea Commons et leurs preuves locales d'accès.

## Contenu

- `migrations/0001_m0_data_model.sql` : schémas, types, tables, contraintes, index, fonctions, triggers, privilèges et politiques RLS M0 ;
- `migrations/0002_m0_data_api_grants.sql` : révocations défensives et privilèges minimaux à appliquer après le provisionnement de la Data API ;
- `migrations/0003_m1_editorial_pipeline.sql` : ingestion éditoriale, skills versionnés, générations, candidats, décisions append-only, publication atomique, rétention, RLS et commandes étroites M1-A ;
- `tests/bootstrap.sql` : rôles Data API et shim local de `auth.user_id()` sur une base de test vide ;
- `tests/m0_rls_test.sql` : fixtures synthétiques et matrice anonyme, propriétaire, étranger, viewer, editor, reviewer et admin ;
- `tests/m1_editorial_pipeline_test.sql` : fixtures synthétiques, accès contributor/reviewer/admin/étranger/anonyme, idempotence, publication atomique, immutabilité, rétention et minimisation des événements ;
- `tests/run-local.sh` : création d'une base éphémère, exécution des preuves M0/M1, contrôle des rejeux accidentels et suppression de la base.

## Exécution locale

Depuis la racine du dépôt, avec `psql`, `createdb` et `dropdb` disponibles :

```sh
database/tests/run-local.sh
```

Le script n'accepte aucune URL de base distante et ne conserve pas les fixtures. Les identités, contenus, références et clés de stockage utilisés par les tests sont fictifs. Il applique les migrations dans leur ordre versionné.

Les contrats, le corpus synthétique et l'adaptateur sans réseau sont documentés dans `editorial/README.md`. Leurs tests s'exécutent séparément avec Node.js :

```sh
node editorial/tests/run-contract-tests.mjs
```

M1-A n'accorde aucun droit direct d'écriture éditoriale à `anonymous` ou `authenticated`. Les mutations autorisées passent par des fonctions `SECURITY DEFINER` à portée étroite qui vérifient l'identité, la capacité et la révision attendue. Les tables `app_private` restent inaccessibles aux rôles runtime.

## Barrières M1-A du lot 1

- une publication accepte uniquement la checklist JSON exacte `rights`, `citations` et `prudence` à `true` ; la décision, les lignes M0, l'audit, le reçu et l'outbox restent dans la même transaction ;
- les IDs d'extraits sont uniques dès l'ingestion, les extraits deviennent immuables et chaque citation factuelle doit résoudre exactement un extrait ;
- `source_intakes.fingerprint_sha256` est une empreinte **déclarée et non vérifiée**, utilisable seulement comme indice de corrélation. Elle n'est jamais publiée comme `urn:sha256`. Une référence publique sans URL est un identifiant opaque possédé par Idea Commons ;
- une empreinte autoritaire est stockée séparément par `record_verified_source_fingerprint`, fonction réservée au serveur. Sa représentation canonique `unicode_nfc_lf_trim_v1` applique, dans cet ordre, Unicode NFC, CRLF/CR vers LF, retrait des SPACE ASCII et TAB en fin de chaque ligne, `String.prototype.trim()` au document entier, encodage UTF-8 sans BOM, puis SHA-256 hexadécimal minuscule. Le runtime Next local dérive cette valeur uniquement depuis le texte brut reçu pour `input_mode=text`, puis l'enregistre dans une continuation propriétaire PGlite atomique ; une ingestion URL reste `submitted` car aucun corps n'est acquis côté serveur. M1-A n'ajoute pas `pgcrypto` et PostgreSQL ne recalcule pas le digest. Cette preuve est locale : l'identité service et la continuité transactionnelle du futur adaptateur Neon/Data API restent à établir séparément ;
- tout texte intégral commence en rétention temporaire avec une échéance. `verify_source_retention_rights` exige une identité membre reviewer/admin non nulle et produit un audit attribué ; après un rejet, le texte redevient toujours temporaire et sa suppression est planifiée au plus tard à J+7. Une éventuelle voie serveur reste différée jusqu'à l'existence d'une identité serveur distincte et prouvable ;
- une contrainte unique, un verrou de ligne et un compare-and-set imposent une seule décision terminale par candidat/révision avant tout effet public.

Le test SQL couvre les variantes négatives et les effets partiels sous PGlite/PostgreSQL. `tests/run-local.sh` ajoute, uniquement lorsqu'un PostgreSQL natif est déjà disponible, deux courses multi-processus : approbation contre approbation, puis approbation contre rejet. PGlite n'est jamais présenté comme preuve d'ordonnancement concurrent natif.

## Frontière Neon

Les migrations n'activent pas la Data API et ne ciblent aucun environnement. Pour une base neuve, la séquence sûre reste : appliquer `0001`, vérifier RLS et révocations, provisionner la Data API explicitement sur `development`, appliquer `0002`, puis `0003` et auditer les rôles et privilèges réels. Pour une base M0 existante, `0003` vient après un audit local et une autorisation distincte de migration sur Neon `development`. Neon `production` reste hors périmètre sans décision humaine séparée.
