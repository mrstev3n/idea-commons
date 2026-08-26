import type { ReactNode } from "react";

type BadgeTone =
  | "fact"
  | "hypothesis"
  | "estimate"
  | "recommendation"
  | "validation_question"
  | "ready"
  | "running"
  | "caution"
  | "failure"
  | "neutral";

export function Badge({
  tone,
  children,
  withDot = false,
}: {
  tone: BadgeTone;
  children: ReactNode;
  withDot?: boolean;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {withDot ? <span className="badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
