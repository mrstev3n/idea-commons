import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ActionVariant = "primary" | "secondary" | "quiet" | "on-dark" | "inverse";
export type ActionSize = "sm" | "md" | "lg";

type SharedActionProps = {
  children: ReactNode;
  className?: string;
  size?: ActionSize;
  variant?: ActionVariant;
};

function actionClassName({
  variant = "primary",
  size = "md",
  className,
}: Omit<SharedActionProps, "children">) {
  return ["ui-action", `ui-action--${variant}`, `ui-action--${size}`, className]
    .filter(Boolean)
    .join(" ");
}

export function ActionButton({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: SharedActionProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={actionClassName({ variant, size, className })}
      data-variant={variant}
      data-size={size}
      {...props}
    />
  );
}

type ActionLinkProps = SharedActionProps &
  LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "className">;

export function ActionLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ActionLinkProps) {
  return (
    <Link
      className={actionClassName({ variant, size, className })}
      data-variant={variant}
      data-size={size}
      {...props}
    />
  );
}
