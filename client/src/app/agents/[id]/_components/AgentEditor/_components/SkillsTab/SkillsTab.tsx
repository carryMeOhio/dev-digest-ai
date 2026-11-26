/* SkillsTab — attach, toggle and reorder the skills this agent reviews with.
   The order here IS the order of the blocks in the assembled prompt. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import {
  buildRows,
  filterRows,
  isDirty,
  moveRow,
  toLinksPayload,
  type SkillRowState,
} from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const skillsQuery = useSkills();
  const linksQuery = useAgentSkills(agent.id);
  const save = useSetAgentSkills();

  const [rows, setRows] = React.useState<SkillRowState[] | null>(null);
  const [search, setSearch] = React.useState("");
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);

  const skills = skillsQuery.data;
  const links = linksQuery.data;

  // Rebuild local order from the server, but never on top of unsaved edits: a
  // background refetch landing mid-reorder would otherwise silently discard the
  // user's work. After a save the rows match the new links, so `isDirty` goes
  // false and the next sync is a no-op anyway.
  React.useEffect(() => {
    if (!skills || !links) return;
    setRows((current) => (current && isDirty(current, links) ? current : buildRows(skills, links)));
  }, [skills, links, agent.id]);

  const isLoading = skillsQuery.isLoading || linksQuery.isLoading;
  const isError = skillsQuery.isError || linksQuery.isError;

  if (isLoading || !rows) {
    return (
      <div style={s.wrap}>
        <Skeleton height={40} />
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void skillsQuery.refetch();
          void linksQuery.refetch();
        }}
      />
    );
  }
  if (rows.length === 0) {
    return <EmptyState icon="Sparkles" title={t("skills.title")} body={t("skills.empty")} />;
  }

  const attachedCount = rows.filter((r) => r.attached && r.enabled).length;
  const dirty = isDirty(rows, links ?? []);
  const visible = filterRows(rows, search);
  // Reordering against a filtered list would move rows the user can't see, so
  // the handles are only live when the full list is showing.
  const canReorder = search.trim().length === 0;

  const toggle = (id: string) =>
    setRows((current) =>
      (current ?? []).map((r) =>
        r.skill.id === id
          ? // One checkbox does both jobs: an unattached skill becomes attached
            // and on; an attached one just flips its per-agent toggle, keeping
            // its place in the order.
            r.attached
            ? { ...r, enabled: !r.enabled }
            : { ...r, attached: true, enabled: true }
          : r,
      ),
    );

  const move = (from: number, to: number) =>
    setRows((current) => moveRow(current ?? [], from, to));

  const commit = () =>
    save.mutate(
      { agentId: agent.id, links: toLinksPayload(rows) },
      { onSuccess: () => toast.success(t("skills.saved")) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)">
          {t("skills.enabledCount", { linked: attachedCount, total: rows.length })}
        </Badge>
        <div style={s.search}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      <p style={s.hint}>{t("skills.orderHint")}</p>

      <div style={s.list}>
        {visible.map((row) => {
          const index = rows.indexOf(row);
          return (
            <div
              key={row.skill.id}
              draggable={canReorder}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => {
                if (!canReorder || dragIndex === null) return;
                e.preventDefault();
                setDragOverIndex(index);
              }}
              onDrop={(e) => {
                if (!canReorder || dragIndex === null) return;
                e.preventDefault();
                move(dragIndex, index);
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              style={s.row(dragOverIndex === index, row.attached)}
              data-testid={`skill-row-${row.skill.name}`}
            >
              {canReorder && (
                <span style={s.grip} aria-hidden="true">
                  <Icon.GripVertical size={14} />
                </span>
              )}

              {/* The name is the checkbox's label, so the control has an
                  accessible name and clicking the name toggles the skill. */}
              <Checkbox
                checked={row.attached && row.enabled}
                onChange={() => toggle(row.skill.id)}
                label={<span style={s.name}>{row.skill.name}</span>}
              />
              <span style={s.description}>{row.skill.description}</span>

              <Badge color="var(--text-muted)">{row.skill.type}</Badge>

              {/* The agent-level checkbox cannot override the global switch, so
                  say that here rather than letting it look broken. */}
              {!row.skill.enabled && (
                <span title={t("skills.globallyDisabledTitle")}>
                  <Badge color="var(--warn)" icon="AlertTriangle">
                    {t("skills.globallyDisabled")}
                  </Badge>
                </span>
              )}
              {row.skill.source !== "manual" && (
                <Badge color="var(--warn)">{t("skills.needsVetting")}</Badge>
              )}

              {canReorder && (
                <span style={s.arrows}>
                  <button
                    type="button"
                    onClick={() => move(index, index - 1)}
                    disabled={index === 0}
                    aria-label={`${t("skills.moveUp")}: ${row.skill.name}`}
                    title={t("skills.moveUp")}
                    style={s.arrowBtn}
                  >
                    <Icon.ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, index + 1)}
                    disabled={index === rows.length - 1}
                    aria-label={`${t("skills.moveDown")}: ${row.skill.name}`}
                    title={t("skills.moveDown")}
                    style={s.arrowBtn}
                  >
                    <Icon.ArrowDown size={12} />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={commit} disabled={!dirty || save.isPending}>
          {save.isPending ? t("skills.saving") : t("skills.save")}
        </Button>
        {dirty && <span style={s.note}>{t("skills.unsaved")}</span>}
      </div>
    </div>
  );
}
