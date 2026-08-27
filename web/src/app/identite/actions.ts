"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";

export interface AuthFormState {
  error: string | null;
}

export async function authenticate(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const mode = formData.get("mode");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!email || password.length < 8 || (mode === "register" && !name)) {
    return { error: "Vérifiez les informations saisies." };
  }

  try {
    const auth = getAuth();
    const result = mode === "register"
      ? await auth.signUp.email({ email, password, name })
      : await auth.signIn.email({ email, password });

    if (result.error) {
      return { error: mode === "register" ? "Ce compte ne peut pas être créé." : "E-mail ou mot de passe incorrect." };
    }
  } catch {
    return { error: "Le service de connexion est momentanément indisponible." };
  }

  redirect("/editorial");
}

export async function logout(): Promise<void> {
  const result = await getAuth().signOut();
  if (result.error) throw new Error("La déconnexion n'a pas pu être confirmée.");
  redirect("/");
}
