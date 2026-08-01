# Base de données M0

Ce dossier contient la première migration PostgreSQL d'Idea Commons et ses preuves locales d'accès.

## Contenu

- `migrations/0001_m0_data_model.sql` : schémas, types, tables, contraintes, index, fonctions, triggers, privilèges et politiques RLS M0 ;
- `tests/bootstrap.sql` : rôles Data API et shim local de `auth.user_id()` sur une base de test vide ;
- `tests/m0_rls_test.sql` : fixtures synthétiques et matrice anonyme, propriétaire, étranger, viewer, editor, reviewer et admin ;
- `tests/run-local.sh` : création d'une base éphémère, exécution des preuves, contrôle du rejeu accidentel et suppression de la base.

## Exécution locale

Depuis la racine du dépôt, avec `psql`, `createdb` et `dropdb` disponibles :

```sh
database/tests/run-local.sh
```

Le script n'accepte aucune URL de base distante et ne conserve pas les fixtures. Les identités, contenus, références et clés de stockage utilisés par les tests sont fictifs.

## Frontière Neon

La migration n'active pas la Data API et ne cible aucun environnement. Son application éventuelle doit commencer sur la branche Neon `development`, après revue du SQL et réussite locale. Les rôles `anonymous` et `authenticated` doivent exister en `NOBYPASSRLS` au moment de l'application pour recevoir les privilèges M0 ; sinon la migration laisse volontairement ces grants absents. Activer ensuite la Data API exige donc un audit explicite des rôles et privilèges. Neon `production` reste hors périmètre sans décision humaine séparée.
