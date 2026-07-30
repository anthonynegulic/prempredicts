"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/app/admin/actions";

/**
 * Thin wrapper so admin pages stay server components. Renders the action's
 * result inline — admin needs to see that an edit landed, not guess.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitClass = "btn sm",
  confirm,
  style,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: string;
  submitClass?: string;
  confirm?: string;
  style?: React.CSSProperties;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      style={style}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <button className={submitClass} type="submit" disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </button>
      <span role="status" aria-live="polite">
        {state.error && <span className="fielderr">{state.error}</span>}
        {state.ok && (
          <span className="fielderr" style={{ color: "var(--ink)" }}>
            {state.ok}
          </span>
        )}
      </span>
    </form>
  );
}
