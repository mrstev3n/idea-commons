# Pipeline éditorial M1-A

Ce dossier contient les artefacts déterministes du premier pipeline éditorial d'Idea Commons. Aucun fichier n'appelle un réseau ou un modèle.

## Contenu

- `corpus/manifest.json` : seize sources fictives, sans donnée personnelle, avec couverture et résultat attendu ;
- `skills/source-to-idea/v1/input.schema.json` : contrat d'entrée du skill ;
- `skills/source-to-idea/v1/output.schema.json` : contrat de sortie et invariants structurels ;
- `skills/source-to-idea/v1/skill.json` : identité immuable du skill et catégories de claims ;
- `simulator/simulated-adapter.mjs` : adaptateur déterministe couvrant succès, erreurs, fallback et épuisement ;
- `tests/run-contract-tests.mjs` : preuves sans dépendance externe.

## Exécution

```sh
node editorial/tests/run-contract-tests.mjs
```

Le corpus est intégralement synthétique et publié sous la licence du dépôt. Ses lieux, organisations, chiffres et situations sont inventés pour les tests ; ils ne constituent pas des faits ou des validations de marché.
