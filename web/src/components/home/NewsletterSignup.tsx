"use client";

import { ChangeEvent, FormEvent, useId, useState } from "react";
import { ActionButton } from "@/components/ui/Action";
import { Field, FieldLabel, InputGroup, InputGroupInput } from "@/components/ui/Field";

type FormMessage = {
  kind: "idle" | "error" | "success";
  text: string;
};

export function NewsletterSignup() {
  const emailId = useId();
  const statusId = useId();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<FormMessage>({
    kind: "idle",
    text: "",
  });

  function changeEmail(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value);
    if (message.kind === "error") {
      setMessage({ kind: "idle", text: "" });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("email") as HTMLInputElement;
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setMessage({ kind: "error", text: "Renseigne une adresse email pour continuer." });
      input.focus();
      return;
    }

    if (!input.checkValidity()) {
      setMessage({ kind: "error", text: "Vérifie le format de l’adresse email." });
      input.focus();
      return;
    }

    setMessage({
      kind: "success",
      text: "C’est noté. Aucun envoi n’est effectué dans cette version locale.",
    });
    setEmail("");
  }

  return (
    <form className="newsletter-form" onSubmit={submit} noValidate>
      <Field invalid={message.kind === "error"}>
        <FieldLabel className="visually-hidden" htmlFor={emailId}>Adresse email</FieldLabel>
        <InputGroup className="newsletter-form__controls">
          <InputGroupInput
            id={emailId}
            name="email"
            type="email"
            value={email}
            onChange={changeEmail}
            inputMode="email"
            autoComplete="email"
            placeholder="vous@exemple.com"
            aria-describedby={message.kind === "idle" ? undefined : statusId}
            aria-invalid={message.kind === "error"}
            required
          />
          <ActionButton className="newsletter-form__submit" variant="inverse" type="submit">
            S’abonner gratuitement
          </ActionButton>
        </InputGroup>
      </Field>
      {message.kind === "idle" ? null : (
        <p
          id={statusId}
          className="newsletter-form__status"
          data-kind={message.kind}
          role="status"
          aria-live="polite"
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
