/* ConfigTab — edit a skill's name, description (its interface), type and body.
   Any content change saves as a new version; the enabled toggle does not.

   The parent mounts this with key={id:version:enabled}, so after a save or a
   restore the form starts from the server's state rather than stale local
   edits — no reset effect needed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, SelectInput, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { isUntrustedSource } from "../../../../../_components/SkillCard/helpers";
import { SKILL_TYPE_VALUES } from "../../../../../constants";
import { approxTokens } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const dirty =
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    body !== skill.body ||
    enabled !== skill.enabled;
  const valid = name.trim() !== "" && description.trim() !== "" && body.trim() !== "";

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name: name.trim(), description: description.trim(), type, body, enabled } },
      { onSuccess: (data) => toast.success(t("editor.saved", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{skill.name}</h2>
        <label style={s.enabledLabel}>
          {t("editor.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
        <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!dirty || !valid || update.isPending}>
          {update.isPending ? t("editor.saving") : t("editor.save")}
        </Button>
      </div>

      {isUntrustedSource(skill) && (
        <div style={s.notice}>
          <Icon.AlertTriangle size={15} style={{ flexShrink: 0, color: "var(--warn)" }} />
          <span>{t("preview.untrustedNotice")}</span>
        </div>
      )}

      <FormField label={t("editor.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>

      <FormField
        label={t("editor.description")}
        hint={t("editor.descriptionHint")}
        required
        right={<span style={s.interfaceTag}>{t("editor.descriptionLabel")}</span>}
      >
        <TextInput value={description} onChange={setDescription} />
      </FormField>

      <FormField label={t("editor.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>

      <FormField
        label={t("editor.body")}
        hint={t("editor.bodyHint")}
        required
        right={<span style={s.tokens}>{t("previewTab.tokens", { count: approxTokens(body) })}</span>}
      >
        <Textarea value={body} onChange={setBody} rows={18} mono />
      </FormField>
    </div>
  );
}
