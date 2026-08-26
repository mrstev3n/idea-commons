import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

/**
 * Moteur PostgreSQL embarqué (PGlite) pour l'exécution locale à 0 USD.
 *
 * Les migrations réelles du dépôt (M0 0001, 0002 puis M1 0003) sont appliquées
 * telles quelles : l'application exerce les vraies commandes serveur, la vraie
 * RLS et les vrais triggers d'immutabilité. Le shim `auth.user_id()` reproduit
 * le contrat Neon Data API, comme dans les tests SQL du dépôt.
 * Frontière d'adaptateur : remplacer ce module par un pool Neon/Postgres ne
 * change aucun autre fichier serveur.
 */

let repoRootCache: string | null = null;

export function repoRoot(): string {
  if (repoRootCache) return repoRootCache;
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(path.join(dir, "database", "migrations"))) {
      repoRootCache = dir;
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("racine du dépôt introuvable (dossier database/migrations attendu)");
}

const globalStore = globalThis as unknown as { __icDb?: Promise<PGlite> };

export function getDb(): Promise<PGlite> {
  globalStore.__icDb ??= initDb();
  return globalStore.__icDb;
}

async function initDb(): Promise<PGlite> {
  const root = repoRoot();
  const dataDir = process.env.IC_DATA_DIR ?? path.join(root, "web", ".data", "pglite");
  await mkdir(path.dirname(dataDir), { recursive: true });
  const db = await PGlite.create(dataDir);

  const applied = await db.query<{ applied: boolean }>(
    "select to_regclass('app.source_intakes') is not null as applied",
  );
  if (!applied.rows[0]?.applied) {
    await applyMigrations(db, root);
    await seed(db, root);
  }
  return db;
}

async function applyMigrations(db: PGlite, root: string): Promise<void> {
  const bootstrap = await readFile(path.join(root, "database", "tests", "bootstrap.sql"), "utf8");
  // Le fichier de bootstrap est un script psql ; seules ses méta-commandes sont retirées.
  const bootstrapSql = bootstrap
    .split("\n")
    .filter((line) => !line.startsWith("\\"))
    .join("\n");
  await db.exec(bootstrapSql);
  for (const file of [
    "0001_m0_data_model.sql",
    "0002_m0_data_api_grants.sql",
    "0003_m1_editorial_pipeline.sql",
  ]) {
    const sql = await readFile(path.join(root, "database", "migrations", file), "utf8");
    await db.exec(sql);
  }
}

/**
 * Amorçage synthétique : identités du harnais local et version publiée du
 * skill source-to-idea v1, lue depuis les fichiers canoniques du dépôt.
 */
async function seed(db: PGlite, root: string): Promise<void> {
  const skillDir = path.join(root, "editorial", "skills", "source-to-idea", "v1");
  const [skillRaw, inputSchema, outputSchema] = await Promise.all([
    readFile(path.join(skillDir, "skill.json"), "utf8"),
    readFile(path.join(skillDir, "input.schema.json"), "utf8"),
    readFile(path.join(skillDir, "output.schema.json"), "utf8"),
  ]);
  const skill = JSON.parse(skillRaw) as { skillId: string; version: string; rules: string[] };

  await db.transaction(async (tx) => {
    await tx.query(
      `insert into app.members (id, auth_user_id, display_name, locale) values
         ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Awa Contributrice', 'fr'),
         ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Rachida Revieweuse', 'fr'),
         ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'Sena Admin', 'fr'),
         ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'Mireille Membre', 'fr')
       on conflict (auth_user_id) do nothing`,
    );
    await tx.query(
      `insert into app.member_role_assignments (member_id, role) values
         ('10000000-0000-4000-8000-000000000001', 'contributor'),
         ('10000000-0000-4000-8000-000000000002', 'reviewer'),
         ('10000000-0000-4000-8000-000000000003', 'contributor'),
         ('10000000-0000-4000-8000-000000000003', 'reviewer'),
         ('10000000-0000-4000-8000-000000000003', 'admin')
       on conflict do nothing`,
    );
    await tx.query(
      `insert into app.prompt_skills (id, slug, name)
       values ('20000000-0000-4000-8000-000000000001', $1, 'Source vers candidat d''idée')
       on conflict (slug) do nothing`,
      [skill.skillId],
    );
    await tx.query(
      `insert into app.prompt_skill_versions (id, skill_id, version, input_schema, output_schema, instructions, published_at)
       values ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', $1, $2::jsonb, $3::jsonb, $4, '2026-08-12T00:00:00Z')
       on conflict (skill_id, version) do nothing`,
      [skill.version, inputSchema, outputSchema, skill.rules.join("\n")],
    );
  });
}

export type DbRole = "anonymous" | "authenticated";

/**
 * Exécute `fn` dans une transaction sous le rôle runtime demandé, avec le
 * sub JWT synthétique exposé via `request.jwt.claim.sub` (contrat des tests
 * SQL du dépôt). RLS et privilèges de colonnes s'appliquent réellement.
 */
export async function withDbRole<T>(
  role: DbRole,
  authUserId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [authUserId ?? ""]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}

/**
 * Exécute une commande membre puis une continuation de confiance dans la même
 * transaction. Le changement de rôle et l'effacement du sub sont possédés par
 * le serveur : aucun paramètre client ne peut demander la continuation service.
 *
 * Cette primitive locale PGlite ne prouve pas encore l'identité service du
 * futur adaptateur Neon/Data API.
 */
export async function withDbRoleThenService<MemberResult, ServiceResult>(
  role: DbRole,
  authUserId: string,
  asMember: (tx: Transaction) => Promise<MemberResult>,
  asService: (tx: Transaction, memberResult: MemberResult) => Promise<ServiceResult>,
): Promise<ServiceResult> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [authUserId]);
    await tx.exec(`set local role ${role}`);
    const memberResult = await asMember(tx);

    await tx.exec("reset role");
    await tx.query("select set_config('request.jwt.claim.sub', '', true)");
    return asService(tx, memberResult);
  });
}

/** Accès service (worker, maintenance) : hors trafic utilisateur, sans set role. */
export async function withServiceDb<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => fn(tx));
}
