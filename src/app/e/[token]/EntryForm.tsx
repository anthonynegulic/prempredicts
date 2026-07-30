"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CLUBS } from "@/lib/clubs";
import { scoringLine, type PointsConfig } from "@/lib/questions";
import { countComplete, validateEntry, type PickInput, type QuestionShape } from "@/lib/validate";
import { savePicks, type SaveResult } from "./actions";

export type FormQuestion = QuestionShape & {
  helpText: string | null;
  sortOrder: number;
  pointsConfig: PointsConfig;
  slotLabels: string[];
  adminEditedAt: string | null;
};

const keyOf = (k: string, i: number) => `${k}::${i}`;

export function EntryForm({
  token,
  questions,
  initial,
}: {
  token: string;
  questions: FormQuestion[];
  initial: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SaveResult | null>(null);

  const picks: PickInput[] = useMemo(
    () =>
      questions.flatMap((q) =>
        Array.from({ length: q.slotCount }, (_, i) => ({
          questionKey: q.key,
          slotIndex: i,
          value: values[keyOf(q.key, i)] ?? "",
        }))
      ),
    [questions, values]
  );

  const { errors, warnings } = useMemo(
    () => validateEntry(questions, picks),
    [questions, picks]
  );

  const complete = countComplete(questions, picks);
  const dirty = useMemo(
    () => Object.keys({ ...values, ...saved }).some((k) => (values[k] ?? "") !== (saved[k] ?? "")),
    [values, saved]
  );

  // Don't let someone wander off mid-entry and lose it.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const errFor = (key: string, slot: number) =>
    errors.find((e) => e.questionKey === key && e.slotIndex === slot)?.message;

  function set(key: string, slot: number, v: string) {
    setValues((prev) => ({ ...prev, [keyOf(key, slot)]: v }));
    setResult(null);
  }

  function submit() {
    startTransition(async () => {
      const res = await savePicks(token, picks);
      setResult(res);
      if (res.ok) setSaved({ ...values });
    });
  }

  return (
    <>
      <div className="wrap block">
        <p className="hint">
          Change anything as often as you like until the deadline · nothing is
          final until it locks
        </p>

        {warnings.length > 0 && (
          <div className="note" style={{ marginBottom: 18 }}>
            <b>Worth a look</b>
            {warnings.map((w) => (
              <p key={w} style={{ margin: "8px 0 0" }}>
                {w}
              </p>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {questions.map((q, qi) => {
            const multi = q.slotCount > 1;
            return (
              <fieldset
                className="qcard"
                key={q.key}
                style={{ border: "2px solid var(--ink)", margin: "0 0 14px", padding: 0 }}
              >
                <legend className="sr">{q.label}</legend>
                <div className="qhead">
                  <span className="qn">{String(qi + 1).padStart(2, "0")}</span>
                  <span className="qt">{q.label}</span>
                  <span className="qp">{scoringLine(q.pointsConfig, q.slotCount)}</span>
                </div>
                <div className="qbody">
                  {q.helpText && <p className="help">{q.helpText}</p>}
                  <div className={`slots${multi ? " multi" : ""}`}>
                    {Array.from({ length: q.slotCount }, (_, i) => {
                      const id = `f-${q.key}-${i}`;
                      const err = errFor(q.key, i);
                      const v = values[keyOf(q.key, i)] ?? "";
                      return (
                        <div className={`field${err ? " bad" : ""}`} key={i}>
                          {/* A single-slot question is already named by the card
                              header, so the label is for screen readers only. */}
                          <label htmlFor={id} className={multi ? undefined : "sr"}>
                            {q.slotLabels[i] ?? q.label}
                          </label>
                          {q.inputType === "free_text" ? (
                            <input
                              id={id}
                              type="text"
                              value={v}
                              maxLength={120}
                              autoComplete="off"
                              placeholder={
                                q.key === "wildcard" ? "One line, anything you like" : "Name"
                              }
                              aria-invalid={err ? true : undefined}
                              aria-describedby={err ? `${id}-err` : undefined}
                              onChange={(e) => set(q.key, i, e.target.value)}
                            />
                          ) : (
                            <select
                              id={id}
                              value={v}
                              aria-invalid={err ? true : undefined}
                              aria-describedby={err ? `${id}-err` : undefined}
                              onChange={(e) => set(q.key, i, e.target.value)}
                            >
                              <option value="">— Pick a club —</option>
                              {CLUBS.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          )}
                          {err && (
                            <p className="fielderr" id={`${id}-err`}>
                              {err}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {q.adminEditedAt && (
                    <p className="fielderr" style={{ color: "var(--grey)" }}>
                      Edited by admin{" "}
                      {new Date(q.adminEditedAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  )}
                </div>
              </fieldset>
            );
          })}

          <div className="savebar">
            <div className="wrap savebar-in">
              <button
                className="btn"
                type="submit"
                disabled={pending || errors.length > 0 || !dirty}
              >
                {pending ? "Saving…" : "Save picks"}
              </button>
              <span
                className={`savestate${
                  result?.ok ? " ok" : result && !result.ok ? " err" : ""
                }`}
                role="status"
                aria-live="polite"
              >
                {errors.length > 0
                  ? `${errors.length} to fix before saving`
                  : pending
                    ? "Saving"
                    : result?.ok
                      ? `Saved · ${complete} of ${questions.length} picks made`
                      : result && !result.ok
                        ? result.message
                        : dirty
                          ? "Unsaved changes"
                          : `${complete} of ${questions.length} picks made`}
              </span>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
