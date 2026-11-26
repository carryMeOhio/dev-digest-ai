/* CreateSkillModal — author a skill by hand. Mirrors CreateAgentModal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { SKILL_TYPE_VALUES } from "../../constants";
import { s } from "./styles";

export function CreateSkillModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const create = useCreateSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("rubric");
  const [body, setBody] = React.useState("");

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({
    value: v,
    label: t(`listItem.type.${v}`),
  }));

  const canSubmit =
    name.trim().length > 0 && description.trim().length > 0 && body.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    const skill = await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      type,
      body,
    });
    onCreated?.(skill);
    onClose();
  };

  return (
    <Modal
      width={680}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Plus"
            onClick={submit}
            disabled={!canSubmit || create.isPending}
          >
            {create.isPending ? t("create.creating") : t("create.submit")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("create.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.namePlaceholder")} />
        </FormField>

        <FormField
          label={t("create.description")}
          hint={t("create.descriptionHint")}
          required
          right={<span style={s.interfaceTag}>{t("create.descriptionLabel")}</span>}
        >
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.descriptionPlaceholder")}
          />
        </FormField>

        <FormField label={t("create.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
        </FormField>

        <FormField label={t("create.body")} hint={t("create.bodyHint")} required>
          <Textarea
            value={body}
            onChange={setBody}
            rows={12}
            mono
            placeholder={t("create.bodyPlaceholder")}
          />
        </FormField>
      </div>
    </Modal>
  );
}
