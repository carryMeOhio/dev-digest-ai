/* ImportSkillModal — upload a .md or .zip, read what the server found, then
   decide. Two separate calls on purpose: the preview writes nothing, so a skill
   is only ever stored after a person has seen its body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Markdown, Modal } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill, useImportSkillPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { typeColor } from "../SkillCard/helpers";
import { ACCEPTED_EXTENSIONS, toBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();

  const [parsed, setParsed] = React.useState<SkillImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setParsed(null);
    setReading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await preview.mutateAsync({
        filename: file.name,
        content_b64: toBase64(bytes),
      });
      setParsed(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("import.failed"));
    } finally {
      setReading(false);
    }
  };

  const confirm = async () => {
    if (!parsed) return;
    // `enabled: false` is also enforced server-side for any non-manual source —
    // sent here so the request says what it means rather than relying on that.
    const skill = await create.mutateAsync({
      name: parsed.name,
      description: parsed.description || parsed.name,
      type: parsed.type,
      body: parsed.body,
      source: "imported_file",
      enabled: false,
    });
    toast.success(t("import.success", { name: skill.name }));
    onImported?.(skill);
    onClose();
  };

  const busy = reading || preview.isPending;

  return (
    <Modal
      width={720}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        parsed ? (
          <div style={s.footer}>
            <Button
              kind="ghost"
              onClick={() => {
                setParsed(null);
                setError(null);
              }}
            >
              {t("import.back")}
            </Button>
            <Button kind="primary" icon="Check" onClick={confirm} disabled={create.isPending}>
              {create.isPending ? t("import.saving") : t("import.confirm")}
            </Button>
          </div>
        ) : (
          <div style={s.footer}>
            <Button kind="ghost" onClick={onClose}>
              {t("create.cancel")}
            </Button>
          </div>
        )
      }
    >
      <div style={s.body}>
        {!parsed && (
          <div style={s.dropZone}>
            <Icon.Upload size={22} style={{ color: "var(--text-muted)" }} />
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              aria-label={t("import.choose")}
              onChange={(e) => void pick(e.target.files?.[0])}
              style={{ display: "none" }}
            />
            <Button
              kind="secondary"
              icon="Upload"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {busy ? t("import.parsing") : t("import.choose")}
            </Button>
            <p style={s.hint}>{t("import.chooseHint")}</p>
            {error && <p style={s.error}>{error}</p>}
          </div>
        )}

        {parsed && (
          <div>
            <div style={s.notice}>
              <Icon.AlertTriangle size={15} style={{ flexShrink: 0, color: "var(--warn)" }} />
              <span>
                <span style={s.noticeTitle}>{t("import.trustTitle")}</span>
                <br />
                {t("import.trustBody")}
              </span>
            </div>

            <div style={s.previewHead}>
              <span style={s.previewName}>{parsed.name}</span>
              <Badge color={typeColor(parsed.type)}>{t(`listItem.type.${parsed.type}`)}</Badge>
              <Badge color="var(--text-muted)" mono>
                {parsed.source_file}
              </Badge>
            </div>

            <div style={s.label}>{t("editor.description")}</div>
            <div style={s.description}>{parsed.description || "—"}</div>

            <div style={s.label}>{t("editor.body")}</div>
            <div style={s.bodyBox}>
              <Markdown>{parsed.body}</Markdown>
            </div>

            {parsed.ignored_entries.length > 0 && (
              <div style={s.ignoredBox}>
                <div style={s.label}>
                  {t("import.ignoredTitle")} ·{" "}
                  {t("import.ignoredCount", { count: parsed.ignored_entries.length })}
                </div>
                {parsed.ignored_entries.map((entry) => (
                  <div key={entry} className="mono" style={s.ignoredItem}>
                    {entry}
                  </div>
                ))}
              </div>
            )}

            {parsed.warnings.map((w) => (
              <p key={w} style={s.warning}>
                {w}
              </p>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
