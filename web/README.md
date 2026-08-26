# Idea Commons — prototype web local (premier incrément vertical IC-07)

Prototype Next.js/TypeScript qui exerce localement le parcours IC-07 de bout en bout :
**source publique → analyse IA (simulée) → revue humaine → publication immuable →
lecture publique anonyme.** Tout s'exécute en local, à 0 USD, sans réseau ni
service distant : la base PostgreSQL est embarquée (PGlite), l'authentification
est un harnais d'identités synthétiques et l'IA est l'adaptateur simulé
canonique du dépôt (`editorial/simulator`).

## Démarrer

```bash
cd web
npm install
npm run seed   # optionnel : publie 2 fiches et laisse 1 cas en revue
npm run dev    # http://localhost:3000
```

La base est créée au premier accès dans `web/.data/pglite` : les migrations
réelles `database/migrations/0001 → 0003` sont appliquées, puis les rôles
PostgreSQL (`anonymous`, `authenticated`, `service`), les membres synthétiques
et la version publiée du skill `source-to-idea@1.0.0` sont amorcés. Supprimer
`web/.data` remet l'environnement à zéro.

## Parcours et surfaces

| Surface | Route | Accès |
|---|---|---|
| Catalogue public | `/` | anonyme |
| Fiche publiée (immuable, claims typés et cités, crédits, licence) | `/idees/[slug]` | anonyme |
| Écran de connexion et d'inscription (non connecté) | `/identite` | tous |
| Cas éditoriaux | `/editorial` | authentifié (RLS) |
| Ajout de source (droits explicites, extraits, empreinte) | `/editorial/sources/nouvelle` | contributor |
| Suivi de cas : provenance, analyse, tentatives, décision | `/editorial/cas/[id]` | créateur ou reviewer |
| Atelier de revue côte à côte | `/editorial/cas/[id]/revue` | créateur (édition) / reviewer (décision) |
| Reçu de décision | `/editorial/cas/[id]/recu` | créateur ou reviewer |

## Architecture locale

- **Autorisation dans la base.** Chaque requête s'exécute sous le rôle
  PostgreSQL réel (`set local role` + `request.jwt.claim.sub`), avec la RLS et
  les fonctions `security definer` M1. Le serveur web ne décide de rien : il
  traduit les erreurs SQL en réponses normatives 401/403/404/409/422.
- **Transport asynchrone.** Le lancement d'analyse écrit un événement outbox
  dans la même transaction que la réservation de quota. Un worker en processus
  le consomme, exécute l'adaptateur simulé via un pont Node
  (`scripts/adapter-bridge.mjs`) et matérialise l'état terminal ; le client
  suit par polling (`/api/cas/[id]/statut`).
- **Identités synthétiques de test.** Les scripts de vérification projettent des
  identités synthétiques vers les rôles SQL afin de prouver les frontières de
  la base. L'écran public `/identite` est uniquement une interface locale : il
  ne transmet ni ne persiste encore les données et ne pilote pas ce harnais.
- **Design system.** Tokens sémantiques OKLCH, typographie, espacement et
  mouvement dans `src/design/` ; composants sans dépendance UI externe ;
  `prefers-reduced-motion` respecté partout.

## Vérifier

```bash
npm run typecheck   # TypeScript strict
npm run build       # build de production
npm run smoke       # parcours complet + frontières normatives sur base jetable
```

Le smoke (`scripts/smoke.mts`) rejoue le parcours IC-07 sur une base PGlite
temporaire et vérifie notamment : 401 anonyme, 403 sans capacité, déduplication
par empreinte (409), RLS (cas étranger invisible), verrou optimiste (409),
séparation contributeur/reviewer, idempotence de la publication, immuabilité
des versions publiées (trigger M0) et le chemin d'échec « cascade épuisée ».

Les tests de contrat de l'adaptateur simulé restent à la racine du dépôt :
`node editorial/tests/run-contract-tests.mjs`.

## Limites de déploiement

Ce lot est un prototype local vérifiable, pas encore une application à déployer
tel quel. La base PGlite écrit sur le système de fichiers local, le worker
simulé lance un processus Node et le polling fait avancer l'outbox de manière
opportuniste. Une mise en ligne exige d'abord les adaptateurs d'authentification,
de base de données et de worker prévus pour l'environnement cible. Les pages
publiques peuvent servir à une revue visuelle locale, mais leur présence ne
constitue pas une preuve de compatibilité Vercel, Cloudflare ou Netlify.
