import type { ReactNode } from "react";

export function FormSection({
  title,
  action,
  lede,
  children
}: {
  title: string;
  action?: ReactNode;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <section className="form-section">
      <div className="setup-section__head">
        <p className="panel-heading">{title}</p>
        {action ?? null}
      </div>
      {lede ? <p className="form-section__lede">{lede}</p> : null}
      {children}
    </section>
  );
}
