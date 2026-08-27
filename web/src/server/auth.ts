import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";

let authInstance: NeonAuth | null = null;

function required(name: "NEON_AUTH_BASE_URL" | "NEON_AUTH_COOKIE_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`configuration d'authentification absente : ${name}`);
  return value;
}

/** Instance Neon Auth créée à la demande pour garder les builds sans secrets. */
export function getAuth(): NeonAuth {
  authInstance ??= createNeonAuth({
    baseUrl: required("NEON_AUTH_BASE_URL"),
    cookies: {
      secret: required("NEON_AUTH_COOKIE_SECRET"),
      sessionDataTtl: 300,
      sameSite: "lax",
    },
    logLevel: "warn",
  });
  return authInstance;
}
