/*
 * Exceptions techniques au contrat de couleurs.
 *
 * Chaque entrée est liée à une ligne exacte et à un nombre d'occurrences. Une
 * modification de la ligne ou une nouvelle valeur exige donc une revue dédiée.
 */
export const RAW_COLOR_ALLOWLIST = [
  {
    id: "source-origins-alpha-mask",
    path: "src/components/home/SourceOrigins.module.css",
    raw: "black",
    line: "mask-image: linear-gradient(to right, transparent, black 3%, black 97%, transparent);",
    occurrences: 2,
    reason: "Le noir définit uniquement l'opacité du masque CSS, pas une couleur produit.",
  },
  {
    id: "hero-alpha-mask-start",
    path: "src/design/components.css",
    raw: "black",
    line: "black 38%,",
    reason: "Le noir définit uniquement l'opacité du masque CSS du Hero.",
  },
  {
    id: "hero-alpha-mask-end",
    path: "src/design/components.css",
    raw: "black",
    line: "black 56%,",
    reason: "Le noir définit uniquement l'opacité du masque CSS du Hero.",
  },
  {
    id: "hero-webgl-paper-material",
    path: "src/components/home/HeroPaperSurface.tsx",
    raw: "0xf0ecdf",
    line: "color: 0xf0ecdf,",
    reason: "Three.js attend une couleur numérique pour le matériau GPU, hors cascade CSS.",
  },
  {
    id: "hero-webgl-hemisphere-key",
    path: "src/components/home/HeroPaperSurface.tsx",
    raw: "0xfff9ec",
    line: "scene.add(new THREE.HemisphereLight(0xfff9ec, 0x64736a, 2.2));",
    reason: "Three.js attend des couleurs numériques pour les lumières GPU, hors cascade CSS.",
  },
  {
    id: "hero-webgl-hemisphere-ground",
    path: "src/components/home/HeroPaperSurface.tsx",
    raw: "0x64736a",
    line: "scene.add(new THREE.HemisphereLight(0xfff9ec, 0x64736a, 2.2));",
    reason: "Three.js attend des couleurs numériques pour les lumières GPU, hors cascade CSS.",
  },
  {
    id: "hero-webgl-directional-key",
    path: "src/components/home/HeroPaperSurface.tsx",
    raw: "0xfff7e7",
    line: "const keyLight = new THREE.DirectionalLight(0xfff7e7, 3.1);",
    reason: "Three.js attend une couleur numérique pour la lumière GPU, hors cascade CSS.",
  },
  {
    id: "hero-webgl-directional-fill",
    path: "src/components/home/HeroPaperSurface.tsx",
    raw: "0xd9e9df",
    line: "const fillLight = new THREE.DirectionalLight(0xd9e9df, 0.65);",
    reason: "Three.js attend une couleur numérique pour la lumière GPU, hors cascade CSS.",
  },
];
