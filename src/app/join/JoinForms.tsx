"use client";

import { useActionState, useState } from "react";
import { PIN_LENGTH } from "@/lib/pin";
import { claimName, signIn, type JoinState } from "./actions";

export type Roster = {
  id: number;
  displayName: string;
  club: string | null;
  claimed: boolean;
}[];

const pinProps = {
  type: "text" as const,
  inputMode: "numeric" as const,
  autoComplete: "off" as const,
  maxLength: PIN_LENGTH,
  placeholder: "••••",
};

const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, PIN_LENGTH);

function Feedback({ state }: { state: JoinState }) {
  if (!state.error && !state.ok) return null;
  return (
    <p
      className="fielderr"
      role="status"
      aria-live="polite"
      style={state.ok ? { color: "var(--ink)" } : undefined}
    >
      {state.error ?? state.ok}
    </p>
  );
}

/**
 * Everyone opens the same link, so the first question is which one you are.
 *
 * Every field here is controlled. React resets an uncontrolled form once its
 * action completes, which would wipe the name you picked every time a PIN was
 * rejected — so a rejected attempt would leave you unable to retry without
 * re-selecting yourself.
 */
export function JoinForms({ roster }: { roster: Roster }) {
  const [mode, setMode] = useState<"new" | "returning">("new");
  const unclaimed = roster.filter((r) => !r.claimed);
  const claimed = roster.filter((r) => r.claimed);

  const [claimState, claimAction, claiming] = useActionState(claimName, {});
  const [signInState, signInAction, signingIn] = useActionState(signIn, {});

  const [claimId, setClaimId] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [signInId, setSignInId] = useState("");
  const [signInPin, setSignInPin] = useState("");

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Join or sign in">
        <button
          type="button"
          role="tab"
          id="tab-new"
          aria-selected={mode === "new"}
          className={`tab${mode === "new" ? " on" : ""}`}
          onClick={() => setMode("new")}
        >
          I&apos;m new here
        </button>
        <button
          type="button"
          role="tab"
          id="tab-returning"
          aria-selected={mode === "returning"}
          className={`tab${mode === "returning" ? " on" : ""}`}
          onClick={() => setMode("returning")}
        >
          I&apos;ve already joined
        </button>
      </div>

      {mode === "new" ? (
        <div className="qcard">
          <div className="qhead">
            <span className="qt">Claim your name</span>
          </div>
          <div className="qbody">
            {roster.length === 0 ? (
              <p className="help" style={{ marginBottom: 0 }}>
                Nobody&apos;s been added yet. Ask the admin to set up the roster.
              </p>
            ) : unclaimed.length === 0 ? (
              <p className="help" style={{ marginBottom: 0 }}>
                Every name is taken. If one of them is yours, switch to
                &ldquo;I&apos;ve already joined&rdquo;. If you should be on the
                list and aren&apos;t, ask the admin to add you.
              </p>
            ) : (
              <form action={claimAction}>
                <p className="help">
                  Pick yourself from the list, then set a {PIN_LENGTH}-digit PIN.
                  The PIN is how you get back in on another phone. Nobody sees
                  your picks but you.
                </p>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label htmlFor="claim-name">Your name</label>
                  <select
                    id="claim-name"
                    name="entrant_id"
                    required
                    value={claimId}
                    onChange={(e) => setClaimId(e.target.value)}
                  >
                    <option value="" disabled>
                      — Pick your name —
                    </option>
                    {unclaimed.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.displayName}
                        {r.club ? ` · ${r.club}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="slots multi" style={{ marginBottom: 12 }}>
                  <div className="field">
                    <label htmlFor="claim-pin">Choose a PIN</label>
                    <input
                      id="claim-pin"
                      name="pin"
                      required
                      value={pin}
                      onChange={(e) => setPin(digitsOnly(e.target.value))}
                      {...pinProps}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="claim-pin2">Again, to be sure</label>
                    <input
                      id="claim-pin2"
                      name="pin_confirm"
                      required
                      value={pin2}
                      onChange={(e) => setPin2(digitsOnly(e.target.value))}
                      {...pinProps}
                    />
                  </div>
                </div>
                <button
                  id="claim-submit"
                  className="btn"
                  type="submit"
                  disabled={claiming}
                >
                  {claiming ? "Joining…" : "Join"}
                </button>
                <Feedback state={claimState} />
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className="qcard">
          <div className="qhead">
            <span className="qt">Sign back in</span>
          </div>
          <div className="qbody">
            {claimed.length === 0 ? (
              <p className="help" style={{ marginBottom: 0 }}>
                Nobody has joined yet. Start with &ldquo;I&apos;m new
                here&rdquo;.
              </p>
            ) : (
              <form action={signInAction}>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label htmlFor="signin-name">Your name</label>
                  <select
                    id="signin-name"
                    name="entrant_id"
                    required
                    value={signInId}
                    onChange={(e) => setSignInId(e.target.value)}
                  >
                    <option value="" disabled>
                      — Pick your name —
                    </option>
                    {claimed.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 12, maxWidth: 200 }}>
                  <label htmlFor="signin-pin">Your PIN</label>
                  <input
                    id="signin-pin"
                    name="pin"
                    required
                    value={signInPin}
                    onChange={(e) => setSignInPin(digitsOnly(e.target.value))}
                    {...pinProps}
                  />
                </div>
                <button
                  id="signin-submit"
                  className="btn"
                  type="submit"
                  disabled={signingIn}
                >
                  {signingIn ? "Checking…" : "Sign in"}
                </button>
                <Feedback state={signInState} />
                <p className="help" style={{ margin: "14px 0 0" }}>
                  Forgotten it? The admin can reset your PIN. Your picks stay
                  exactly as they are.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
