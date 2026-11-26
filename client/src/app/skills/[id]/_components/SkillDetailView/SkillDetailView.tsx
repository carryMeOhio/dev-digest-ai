/* Skill editor screen (/skills/:id). Skill list on the left, the selected
   skill's tabs on the right: Config · Preview · Stats · Versions. Tab state
   lives in ?tab=, mirroring the agent editor. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import { useSetSearchParam } from "@/lib/search-params";
import { useSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../../../_components/SkillCard";
import { filterSkills } from "../../../_components/SkillCard/helpers";
import { AddSkillMenu } from "../../../_components/AddSkillMenu";
import { CreateSkillModal } from "../../../_components/CreateSkillModal";
import { ImportSkillModal } from "../../../_components/ImportSkillModal";
import { skillHref } from "../../../_components/SkillsListView";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS, toTab, type SkillTab } from "./constants";
import { s } from "./styles";

export function SkillDetailView({ id }: { id: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const setParam = useSetSearchParam();

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();

  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const tab = toTab(search.get("tab"));
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  const open = (sk: Skill) => router.push(skillHref(sk.id, tab));

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={notFound ? t("detail.notFound.title") : t("detail.loadError")}
          body={notFound ? t("detail.notFound.body") : error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} onCreated={open} />}
      {importing && <ImportSkillModal onClose={() => setImporting(false)} onImported={open} />}

      <div style={s.shell}>
        <aside style={s.listCol}>
          <div style={s.listHead}>
            <div style={s.listTitleRow}>
              <h1 style={s.listTitle}>{t("detail.listTitle")}</h1>
              <AddSkillMenu onCreate={() => setCreating(true)} onImport={() => setImporting(true)} />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                aria-label={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.listBody}>
            {filterSkills(skills ?? [], query).map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                onClick={() => open(sk)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                // Deleting the skill you are looking at leaves nothing to show.
                onDeleted={sk.id === id ? () => router.push("/skills") : undefined}
              />
            ))}
          </div>
        </aside>

        {isLoading || !skill ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={300} />
          </div>
        ) : (
          <section style={s.editor}>
            <div style={s.editorHead}>
              <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
              <h1 style={s.editorTitle}>{skill.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {t("preview.version", { version: skill.version })}
              </Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">{t("preview.disabled")}</Badge>}
            </div>
            <div style={s.tabsBar}>
              <Tabs tabs={tabs} value={tab} onChange={(k) => setParam("tab", k)} pad="0 24px" />
            </div>
            <div style={s.editorBody}>
              <TabBody tab={tab} skill={skill} />
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function TabBody({ tab, skill }: { tab: SkillTab; skill: Skill }) {
  switch (tab) {
    case "preview":
      return <PreviewTab skill={skill} />;
    case "stats":
      return <StatsTab skillId={skill.id} />;
    case "versions":
      return <VersionsTab skill={skill} />;
    default:
      // Remount on any server-side change so the form never shows stale content
      // after a save, a restore, or a toggle from the list column.
      return <ConfigTab key={`${skill.id}:${skill.version}:${skill.enabled}`} skill={skill} />;
  }
}
