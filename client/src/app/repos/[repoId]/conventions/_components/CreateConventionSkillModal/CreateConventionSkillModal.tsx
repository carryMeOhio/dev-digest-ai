/* CreateConventionSkillModal — turn the currently-accepted conventions into a
   skill. Pre-filled (name/description/body) from the accepted candidates;
   every field stays editable. Mirrors skills/_components/CreateSkillModal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { useCreateConventionSkill } from "@/lib/hooks/conventions";
import { buildDefaultDescription, buildSkillDraft, DEFAULT_SKILL_NAME } from "./helpers";
import { s } from "./styles";

export function CreateConventionSkillModal({
  repoId,
  repoFullName,
  accepted,
  onClose,
  onCreated,
}: {
  repoId: string;
  repoFullName?: string | null;
  accepted: ConventionCandidate[];
  onClose: () => void;
  onCreated?: (skill: Skill) => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const create = useCreateConventionSkill(repoId);

  const [name, setName] = React.useState(DEFAULT_SKILL_NAME);
  const [description, setDescription] = React.useState(buildDefaultDescription(repoFullName));
  const [body, setBody] = React.useState(() => buildSkillDraft(accepted));

  const canSubmit =
    name.trim().length > 0 && description.trim().length > 0 && body.trim().length > 0;

  // Local Escape handling — the kit Modal only closes on backdrop/header click.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!canSubmit) return;
    const skill = await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      body,
    });
    toast.success(t("skillModal.createdToast", { name: skill.name }));
    onCreated?.(skill);
    onClose();
  };

  return (
    <Modal
      width={680}
      title={t("skillModal.title")}
      subtitle={t("skillModal.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("skillModal.discard")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={submit}
            disabled={!canSubmit || create.isPending}
          >
            {create.isPending ? t("skillModal.saving") : t("skillModal.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("skillModal.name")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>

        <FormField label={t("skillModal.description")} hint={t("skillModal.descriptionHint")} required>
          <TextInput value={description} onChange={setDescription} />
        </FormField>

        <FormField label={t("skillModal.body")} hint={t("skillModal.bodyHint")} required>
          <Textarea value={body} onChange={setBody} rows={12} mono />
        </FormField>
      </div>
    </Modal>
  );
}
