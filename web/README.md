# Idea Commons — prototype web local (premier incrément vertical IC-07)

Application Next.js/TypeScript qui porte le parcours IC-07 :
**source publique → analyse IA (simulée) → revue humaine → publication immuable →
lecture publique.** Les actions membre passent par Neon Data API/PostgREST avec
un JWT Neon Auth vérifié. Hyperdrive est réservé au consommateur Queue/outbox.
Neon Auth porte désormais l'inscription, la connexion et la session applicative.
L'IA reste l'adaptateur simulé canonique du dépôt (`editorial/simulator`) :
aucun appel IA réel n'est effectué.

## Démarrer

```bash
cd web
npm install
export NEON_DATA_API_URL='https://…/neondb/rest/v1'
npm run dev    # http://localhost:3000
```

Pour exercer Neon Auth, copiez `.dev.vars.example` vers un fichier local ignoré,
puis renseignez l'URL Auth de la branche et un secret cookie serveur d'au moins
32 caractères. Ne commitez jamais ce secret.

La Data API doit viser une base migrée avec `database/migrations/0001 → 0006`.
Une configuration absente ou invalide échoue avant requête et sa valeur
n'est jamais journalisée. Créer une base, un rôle ou un secret reste séparé.

Les preuves development JWT → RPC, séparation de deux identités et RLS métier
sont acquises. La limite restante est le cycle applicatif déployé : cookies HTTPS,
`getSession()`, `token()` puis logout. Le catalogue anonyme reste bloqué séparément
car les RPC publiques de la migration 0006 sont encore réservées au rôle
`authenticated`.

## Parcours et surfaces

| Surface | Route | Accès |
|---|---|---|
| Catalogue public | `/` | anonyme |
| Fiche publiée (immuable, claims typés et cités, crédits, licence) | `/idees/[slug]` | anonyme |
| Connexion et inscription Neon Auth | `/identite` | tous |
| Cas éditoriaux | `/editorial` | authentifié (RLS) |
| Ajout de source (droits explicites, extraits, empreinte) | `/editorial/sources/nouvelle` | contributor |
| Suivi de cas : provenance, analyse, tentatives, décision | `/editorial/cas/[id]` | créateur ou reviewer |
| Atelier de revue côte à côte | `/editorial/cas/[id]/revue` | créateur (édition) / reviewer (décision) |
| Reçu de décision | `/editorial/cas/[id]/recu` | créateur ou reviewer |

## Architecture d'exécution

- **Autorisation dans la base.** Le repository membre appelle uniquement des RPC
  étroites via Data API, avec JWT Neon Auth et profils `app`. Aucun credential
  owner, `SET ROLE`, SQL arbitraire ou accès direct aux tables n'est exposé.
- **Transport asynchrone.** Le lancement d'analyse écrit un événement outbox
  dans la même transaction que la réservation de quota. Un relais Cron borné
  l'envoie à Cloudflare Queues ; le consommateur idempotent exécute directement
  l'adaptateur simulé Worker-safe. Le polling `/api/cas/[id]/statut` est sans effet.
- **Identités.** Le serveur obtient le JWT depuis la session Neon Auth. Le runtime
  compare l'identifiant de `app.runtime_identity()` à
  `session.user.id`; les rôles métier proviennent uniquement de
  `app.member_role_assignments`. Les fixtures synthétiques restent dans les tests.
- **Design system.** Tokens sémantiques OKLCH, typographie, espacement et
  mouvement dans `src/design/` ; composants sans dépendance UI externe ;
  `prefers-reduced-motion` respecté partout.

## Vérifier

```bash
npm run typecheck   # TypeScript strict
npm run test:auth-runtime # contrat d'amorçage Auth/Data API
npm run build       # build de production
npm run smoke       # contrats runtime Worker-safe + empreinte canonique
```

Le test runtime exécute le contrat JWT/RPC mock, les bornes de batch/retry,
le crash après envoi, le doublon, la DLQ, les handlers, l'adaptateur simulé pur et l'absence de consommation depuis les GET. RLS,
immutabilité et concurrence restent couvertes par `database/tests/run-local.sh`
lorsqu'un PostgreSQL local est disponible.

Les tests de contrat de l'adaptateur simulé restent à la racine du dépôt :
`node editorial/tests/run-contract-tests.mjs`.

## Limites de déploiement

La PR #7 est intégrée et les bindings sont composés localement. Le fichier
`runtime-readiness.json` bloque preview/production tant que les preuves JWT/RLS,
moindre privilège des deux identités et bindings Cloudflare ne sont pas toutes
validées. Un build local n'est pas une preuve de déploiement Cloudflare.
