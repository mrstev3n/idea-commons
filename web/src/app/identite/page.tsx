import type { Metadata } from "next";
import { IdentityAccess } from "./IdentityAccess";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Se connecter ou créer un compte Idea Commons.",
};

export default function IdentitePage() {
  return <IdentityAccess />;
}
