import { cookies } from "next/headers";
import { IDENTITIES, type SyntheticIdentity } from "./identities";

/** Session du harnais local : identité synthétique portée par un cookie httpOnly. */

export { IDENTITIES, canContribute, canReview } from "./identities";
export type { SyntheticIdentity } from "./identities";

const COOKIE_NAME = "ic-identity";

export async function getCurrentIdentity(): Promise<SyntheticIdentity> {
  const store = await cookies();
  const key = store.get(COOKIE_NAME)?.value;
  return IDENTITIES.find((identity) => identity.key === key) ?? IDENTITIES[0];
}

export async function setCurrentIdentity(key: string): Promise<void> {
  if (!IDENTITIES.some((identity) => identity.key === key)) {
    throw new Error("identité inconnue");
  }
  const store = await cookies();
  store.set(COOKIE_NAME, key, { httpOnly: true, sameSite: "lax", path: "/" });
}
