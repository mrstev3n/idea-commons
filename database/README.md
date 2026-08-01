# Base de données M0

Ce dossier contient la première migration PostgreSQL d'Idea Commons et ses preuves locales d'accès.

## Contenu

- `migrations/0001_m0_data_model.sql` : schémas, types, tables, contraintes, index, fonctions, triggers, privilèges et politiques RLS M0 ;
- `migrations/0002_m0_data_api_grants.sql` : révocations défensives et privilèges minimaux à appliquer après le provisionnement de la Data API ;
- `tests/bootstrap.sql` : rôles Data API et shim local de `auth.user_id()` sur une base de test vide ;
- `tests/m0_rls_test.sql` : fixtures synthétiques et matrice anonyme, propriétaire, étranger, viewer, editor, reviewer et admin ;
- `tests/run-local.sh` : création d'une base éphémère, exécution des preuves, contrôle du rejeu accidentel et suppression de la base.

## Exécution locale

Depuis la racine du dépôt, avec `psql`, `createdb` et `dropdb` disponibles :

```sh
database/tests/run-local.sh
```

Le script n'accepte aucune URL de base distante et ne conserve pas les fixtures. Les identités, contenus, références et clés de stockage utilisés par les tests sont fictifs. Il applique les migrations dans leur ordre versionné.

## Frontière Neon

Les migrations n'activent pas la Data API et ne ciblent aucun environnement. Leur application éventuelle doit commencer sur la branche Neon `development`, après revue du SQL et réussite locale. La séquence sûre est : appliquer `0001`, vérifier RLS et révocations, provisionner la Data API explicitement sur `development`, puis appliquer `0002` et auditer les rôles et privilèges réels. Neon `production` reste hors périmètre sans décision humaine séparée.
