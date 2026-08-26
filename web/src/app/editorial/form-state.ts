/**
 * Contrat d'état des formulaires éditoriaux, partagé entre les server actions
 * et les composants clients. Volontairement hors du module `"use server"` :
 * un module server action ne peut exporter que des fonctions asynchrones, et
 * ses autres exports deviendraient des références serveur inutilisables côté
 * client (cause d'un 500 au premier rendu).
 */

export interface FormState {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: Record<string, string>;
}

export interface ReviewActionState extends FormState {
  savedRevision?: number;
}

export const IDLE_FORM_STATE: FormState = { status: "idle", message: null, fieldErrors: {} };
