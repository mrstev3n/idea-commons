import { Client } from "pg";
import { neon } from "@neondatabase/serverless";

export interface QueryResult<Row> { rows: Row[] }
export interface DbTransaction {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>;
  exec(text: string): Promise<void>;
}
export interface DatabaseConnectionConfig {
  trustedConnectionString: string;
  outboxConnectionString: string;
}
type TransactionRunner = <T>(fn: (tx: DbTransaction) => Promise<T>) => Promise<T>;

let configuredTrustedRunner: TransactionRunner | null = null;
let configuredServiceRunner: TransactionRunner | null = null;

/** Injection Worker : passer `env.HYPERDRIVE.connectionString`. */
export function configureDatabase(config: DatabaseConnectionConfig): void {
  const trustedUrl = validateDatabaseConnectionString(config.trustedConnectionString);
  const outboxUrl = validateDatabaseConnectionString(config.outboxConnectionString);
  configuredTrustedRunner = (fn) => runNeonQueries(trustedUrl, fn);
  configuredServiceRunner = (fn) => runNeonTransaction(outboxUrl, fn);
}

export function validateDatabaseConnectionString(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error("configuration PostgreSQL absente : injecter le binding Hyperdrive ou IC_DATABASE_URL");
  }
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("configuration PostgreSQL invalide"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || !parsed.username) {
    throw new Error("configuration PostgreSQL invalide");
  }
  return value;
}

/** Injection locale de tests, sans filesystem ni réseau. */
export function setDatabaseTransactionRunnerForTests(runner: TransactionRunner | null): void {
  configuredTrustedRunner = runner;
  configuredServiceRunner = runner;
}

function serviceTransactionRunner(): TransactionRunner {
  if (!configuredServiceRunner) throw new Error("repository de service Hyperdrive non configuré");
  return configuredServiceRunner;
}

function trustedTransactionRunner(): TransactionRunner {
  if (!configuredTrustedRunner) throw new Error("repository de continuation de confiance non configuré");
  return configuredTrustedRunner;
}

async function runNeonQueries<T>(connectionString: string, fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  const sql = neon(connectionString, { fullResults: true });
  const tx: DbTransaction = {
    query: async <Row>(text: string, values?: readonly unknown[]) => {
      const result = await sql.query(text, values ? [...values] : undefined, { fullResults: true });
      return { rows: result.rows as Row[] };
    },
    exec: async (text: string) => { await sql.query(text); },
  };
  return fn(tx);
}

async function runNeonTransaction<T>(connectionString: string, fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  // Hyperdrive possède le pool : le Client applicatif reste borné à la transaction.
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("begin");
    const result = await fn(asTransaction(client));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

function asTransaction(client: Client): DbTransaction {
  return {
    query: async <Row>(text: string, values?: readonly unknown[]) => {
      const result = await client.query(text, values ? [...values] : undefined);
      return { rows: result.rows as Row[] };
    },
    exec: async (text: string) => { await client.query(text); },
  };
}

export async function withServiceDb<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return serviceTransactionRunner()(fn);
}

export async function withTrustedDb<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return trustedTransactionRunner()(fn);
}
