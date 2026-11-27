/* ConventionCard — one extracted convention: the rule (editable inline),
   its evidence (file + verbatim snippet), a confidence meter, and the
   accept/reject actions. Mirrors FindingCard's evidence-link pattern. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, IconBtn, MonoLink, PercentProgress, Textarea } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function ConventionCard({
  convention,
  repoFullName,
  defaultBranch,
  onAccept,
  onReject,
  onSaveRule,
  pending,
}: {
  convention: ConventionCandidate;
  repoFullName?: string | null;
  defaultBranch?: string | null;
  onAccept: () => void;
  onReject: () => void;
  onSaveRule: (rule: string) => void;
  pending?: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(convention.rule);

  const startEdit = () => {
    setDraft(convention.rule);
    setEditing(true);
  };
  const save = () => {
    const next = draft.trim();
    if (next.length > 0 && next !== convention.rule) onSaveRule(next);
    setEditing(false);
  };

  const fileHref =
    repoFullName && defaultBranch
      ? githubBlobUrl(repoFullName, defaultBranch, convention.evidence_path)
      : undefined;

  return (
    <div style={s.card}>
      <div style={s.top}>
        <div style={s.ruleRow}>
          {editing ? (
            <Textarea value={draft} onChange={setDraft} rows={2} />
          ) : (
            <>
              <span style={s.rule}>{convention.rule}</span>
              <IconBtn icon="Edit" label={t("card.edit")} size={24} onClick={startEdit} />
            </>
          )}
        </div>
        {!editing && (
          <div style={s.actions}>
            {convention.accepted ? (
              <span style={s.acceptedTag}>
                <Icon.Check size={14} />
                {t("card.accepted")}
              </span>
            ) : (
              <Button kind="primary" size="sm" icon="Check" disabled={pending} onClick={onAccept}>
                {pending ? t("card.accepting") : t("card.accept")}
              </Button>
            )}
            <Button kind="ghost" size="sm" icon="X" disabled={pending} onClick={onReject}>
              {t("card.reject")}
            </Button>
          </div>
        )}
      </div>

      <div style={s.evidence}>
        <div style={s.evidencePath}>
          <span className="mono" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            {convention.evidence_path}
          </span>
          {fileHref && (
            <MonoLink href={fileHref}>
              <Icon.ExternalLink size={11} style={{ marginRight: 4, verticalAlign: "-1px" }} />
              GitHub
            </MonoLink>
          )}
        </div>
        <div className="mono" style={s.snippet}>
          {convention.evidence_snippet}
        </div>
      </div>

      <PercentProgress value={convention.confidence * 100} label={t("card.confidence")} />

      {editing && (
        <div style={s.editFooter}>
          <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
            {t("card.cancel")}
          </Button>
          <Button kind="primary" size="sm" onClick={save}>
            {t("card.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
