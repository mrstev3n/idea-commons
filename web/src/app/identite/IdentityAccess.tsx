"use client";

import Link from "next/link";
import { FormEvent, useId, useState } from "react";
import { IconArrowLeft, IconAt, IconLock, IconUser } from "@tabler/icons-react";
import { ActionButton } from "@/components/ui/Action";
import { Field, FieldLabel, InputGroup, InputGroupInput } from "@/components/ui/Field";
import styles from "./identite.module.css";

type AccessMode = "login" | "register";

export function IdentityAccess() {
  const [mode, setMode] = useState<AccessMode>("login");
  const [message, setMessage] = useState("");
  const panelId = useId();

  function selectMode(nextMode: AccessMode) {
    setMode(nextMode);
    setMessage("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Cette version locale ne transmet encore aucune donnée.");
  }

  return (
    <div className={styles.page} data-identity-page>
      <aside className={styles.editorialPanel} aria-label="La promesse Idea Commons">
        <div className={styles.editorialBrand}>
          <img src="/brand/idea-commons-mark.png" alt="" />
          <span>Idea Commons</span>
        </div>
        <div className={styles.editorialCopy}>
          <p className={styles.eyebrow}>Votre espace</p>
          <h1>Gardez les bonnes idées à portée de main.</h1>
          <p>
            Enregistrez les idées qui vous intéressent, retrouvez-les dans votre espace
            et gardez le fil même lorsque le catalogue se renouvelle.
          </p>
        </div>
        <p className={styles.editorialFoot}>De nouvelles idées rejoignent le catalogue chaque jour.</p>
      </aside>

      <section className={styles.accessPanel} aria-labelledby={`${panelId}-title`}>
        <div className={styles.accessShell}>
          <Link className={styles.backLink} href="/">
            <IconArrowLeft aria-hidden="true" size={17} stroke={1.8} />
            Retour à l’accueil
          </Link>

          <div className={styles.mobileBrand}>
            <img src="/brand/idea-commons-mark.png" alt="" />
            <span>Idea Commons</span>
          </div>

          <header className={styles.heading}>
            <p className={styles.eyebrow}>{mode === "login" ? "Bon retour" : "Créer votre espace"}</p>
            <h2 id={`${panelId}-title`}>
              {mode === "login" ? "Se connecter" : "Créer un compte"}
            </h2>
            <p>
              {mode === "login"
                ? "Retrouvez vos idées enregistrées et votre espace personnel."
                : "Enregistrez les idées qui vous intéressent et retrouvez-les facilement."}
            </p>
          </header>

          <div className={styles.modeSwitch} role="group" aria-label="Accès au compte">
            <button
              type="button"
              aria-pressed={mode === "login"}
              onClick={() => selectMode("login")}
            >
              Connexion
            </button>
            <button
              type="button"
              aria-pressed={mode === "register"}
              onClick={() => selectMode("register")}
            >
              Inscription
            </button>
          </div>

          <form className={styles.form} onSubmit={submit}>
            {mode === "register" ? (
              <Field>
                <FieldLabel htmlFor={`${panelId}-name`}>Nom</FieldLabel>
                <InputGroup>
                  <IconUser className={styles.fieldIcon} aria-hidden="true" size={18} stroke={1.7} />
                  <InputGroupInput
                    id={`${panelId}-name`}
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Votre nom"
                    required
                  />
                </InputGroup>
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor={`${panelId}-email`}>Adresse e-mail</FieldLabel>
              <InputGroup>
                <IconAt className={styles.fieldIcon} aria-hidden="true" size={18} stroke={1.7} />
                <InputGroupInput
                  id={`${panelId}-email`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                  required
                />
              </InputGroup>
            </Field>

            <Field>
              <div className={styles.passwordLabel}>
                <FieldLabel htmlFor={`${panelId}-password`}>Mot de passe</FieldLabel>
                {mode === "login" ? (
                  <button
                    type="button"
                    onClick={() => setMessage("La récupération de compte sera disponible avec l’authentification.")}
                  >
                    Mot de passe oublié&nbsp;?
                  </button>
                ) : null}
              </div>
              <InputGroup>
                <IconLock className={styles.fieldIcon} aria-hidden="true" size={18} stroke={1.7} />
                <InputGroupInput
                  id={`${panelId}-password`}
                  name="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder="8 caractères minimum"
                  minLength={8}
                  required
                />
              </InputGroup>
            </Field>

            <ActionButton className={styles.submit} size="lg" type="submit" variant="primary">
              {mode === "login" ? "Se connecter" : "Créer mon compte"}
            </ActionButton>

            <p className={styles.formStatus} role="status" aria-live="polite">
              {message}
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
