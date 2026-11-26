/* SkillCard — one skill in the library: name, type, enabled toggle, delete,
   description, origin + version, and how much it is actually used. A skill from
   outside is marked so its origin is visible before anyone attaches it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { formatRate, isUntrustedSource, typeColor } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  onDeleted,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const untrusted = isUntrustedSource(skill);
  const usage = skill.usage;

  const remove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t("editor.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, { onSuccess: () => onDeleted?.() });
  };

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)} data-testid={`skill-card-${skill.name}`}>
      <div style={s.headerRow}>
        <span style={s.name} title={skill.name}>
          {skill.name}
        </span>
        <Badge color={typeColor(skill.type)}>{t(`listItem.type.${skill.type}`)}</Badge>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={del.isPending}
          title={t("card.delete")}
          aria-label={`${t("card.delete")}: ${skill.name}`}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} />
        </button>
      </div>

      <div style={s.description}>{skill.description}</div>

      <div style={s.sourceLine}>
        {t("card.sourceVersion", {
          source: t(`listItem.source.${skill.source}`),
          version: skill.version,
        })}
        {untrusted && (
          <span title={t("listItem.vettingTitle")} style={{ marginLeft: 8 }}>
            <Badge color="var(--warn)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>

      {usage && (
        <div style={s.metaRow} title={t("card.statsTitle", { days: usage.window_days })}>
          <span style={s.agentsChip}>
            <Icon.Cpu size={12} />
            {t("card.agents", { count: usage.agents })}
          </span>
          <span style={s.stat}>{t("card.pullFreq", { value: formatRate(usage.pull_freq) })}</span>
          <span style={s.stat}>{t("card.accept", { value: formatRate(usage.accept_rate) })}</span>
        </div>
      )}
    </div>
  );
}
