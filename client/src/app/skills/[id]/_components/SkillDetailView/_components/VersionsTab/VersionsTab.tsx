/* VersionsTab — every content snapshot of a skill, newest first. Any version
   can be viewed, and any non-current one restored. A restore never rewrites
   history: it appends the old content as the newest version, so the restore
   itself can always be undone from this same list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { changedFields } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);

  if (isLoading) return <Skeleton height={160} />;
  if (isError || !versions) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  return (
    <div style={s.wrap}>
      <div>
        <h2 style={s.title}>{t("versions.title")}</h2>
        <p style={s.subtitle}>{t("versions.subtitle")}</p>
      </div>
      <div style={s.list}>
        {versions.map((v, i) => (
          <VersionRow key={v.version} skill={skill} version={v} changed={changedFields(versions, i)} />
        ))}
      </div>
    </div>
  );
}

function VersionRow({
  skill,
  version: v,
  changed,
}: {
  skill: Skill;
  version: SkillVersion;
  changed: string[];
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const restore = useRestoreSkillVersion();
  const [open, setOpen] = React.useState(false);
  const current = v.version === skill.version;

  const doRestore = () => {
    const next = skill.version + 1;
    if (!window.confirm(t("versions.restoreConfirm", { version: v.version, next }))) return;
    restore.mutate(
      { id: skill.id, version: v.version },
      { onSuccess: (data) => toast.success(t("versions.restored", { version: v.version, next: data.version })) },
    );
  };

  const summary =
    changed.length > 0
      ? t("versions.changed", { fields: changed.map((f) => t(`versions.field.${f}`)).join(", ") })
      : v.version === 1
        ? t("versions.initial")
        : null;

  return (
    <div style={s.row(current)} data-testid={`version-${v.version}`}>
      <div style={s.rowHead}>
        <span className="tnum" style={s.version}>
          v{v.version}
        </span>
        {current && <Badge color="var(--accent)">{t("versions.current")}</Badge>}
        {v.restored_from != null && (
          <Badge color="var(--info)" icon="History">
            {t("versions.restoredFrom", { version: v.restored_from })}
          </Badge>
        )}
        <span style={s.name}>{v.name}</span>
        {summary && <span style={s.changed}>{summary}</span>}
        <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
        <span style={s.actions}>
          <Button kind="ghost" size="sm" icon={open ? "EyeOff" : "Eye"} onClick={() => setOpen((o) => !o)}>
            {open ? t("versions.hide") : t("versions.view")}
          </Button>
          {!current && (
            <Button
              kind="secondary"
              size="sm"
              icon="History"
              onClick={doRestore}
              disabled={restore.isPending}
              aria-label={`${t("versions.restore")} v${v.version}`}
            >
              {restore.isPending ? t("versions.restoring") : t("versions.restore")}
            </Button>
          )}
        </span>
      </div>

      {open && (
        <div style={s.detail}>
          <div style={s.detailLine}>
            <span style={s.detailKey}>{t("versions.field.description")}</span>
            {v.description}
          </div>
          <div style={s.detailLine}>
            <span style={s.detailKey}>{t("versions.field.type")}</span>
            {t(`listItem.type.${v.type}`)}
          </div>
          <pre className="mono" style={s.pre}>
            {v.body}
          </pre>
        </div>
      )}
    </div>
  );
}
