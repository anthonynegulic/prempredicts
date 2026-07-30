import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __sql: Sql | undefined;
}

function connect(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."
    );
  }
  return postgres(url, {
    // Neon and Supabase both drop idle connections aggressively.
    idle_timeout: 20,
    max: 5,
    // Pooled serverless connections can't reuse prepared statements.
    prepare: false,
  });
}

let client: Sql | undefined = global.__sql;

function get(): Sql {
  if (!client) {
    client = connect();
    // Reuse across hot reloads in dev so we don't exhaust the pool.
    if (process.env.NODE_ENV !== "production") global.__sql = client;
  }
  return client;
}

/**
 * Lazy handle. Connecting on first query rather than on import matters:
 * `next build` evaluates every route module to collect page data, and it does
 * that without a database. Eager connection would make the build require one.
 */
export const sql = new Proxy((() => {}) as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    // Tagged-template call: sql`select ...`
    return (get() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop: string | symbol) {
    const c = get() as unknown as Record<string | symbol, unknown>;
    const value = c[prop];
    return typeof value === "function" ? value.bind(c) : value;
  },
}) as Sql;
