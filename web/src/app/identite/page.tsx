import type { Metadata } from "next";
import { IdentityAccess } from "./IdentityAccess";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Se connecter ou créer un compte Idea Commons.",
};

export const dynamic = "force-dynamic";

export default function IdentitePage() {
  return <IdentityAccess />;
}
