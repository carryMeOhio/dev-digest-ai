/* StatsTab — how much a skill is actually used, derived from run traces over a
   trailing window, plus the agents it is attached to. Rates with nothing to
   divide by render as "—": an unused skill is not a 0%-accepted skill. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { formatRate } from "../../../../../_components/SkillCard/helpers";
import { s } from "./styles";

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div style={s.tile}>
      <span style={s.tileLabel}>{label}</span>
      <span className="tnum" style={s.tileValue}>
        {value}
      </span>
      <span style={s.tileHint}>{hint}</span>
    </div>
  );
}

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) return <Skeleton height={160} />;
  if (isError || !stats) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  return (
    <div style={s.wrap}>
      <span style={s.window}>{t("stats.window", { days: stats.window_days })}</span>

      <div style={s.tiles}>
        <Tile label={t("stats.agents")} value={stats.agents} hint={t("stats.agentsHint")} />
        <Tile label={t("stats.runs")} value={stats.runs} hint={t("stats.runsHint")} />
        <Tile label={t("stats.pullFreq")} value={formatRate(stats.pull_freq)} hint={t("stats.pullFreqHint")} />
        <Tile label={t("stats.accept")} value={formatRate(stats.accept_rate)} hint={t("stats.acceptHint")} />
        <Tile label={t("stats.avgTokens")} value={stats.avg_tokens ?? "—"} hint={t("stats.avgTokensHint")} />
      </div>

      {stats.runs === 0 && <p style={s.muted}>{t("stats.noData", { days: stats.window_days })}</p>}

      <section>
        <h3 style={s.sectionTitle}>{t("stats.linkedTitle")}</h3>
        {stats.agent_links.length === 0 ? (
          <p style={s.muted}>{t("stats.linkedEmpty")}</p>
        ) : (
          stats.agent_links.map((l) => (
            <div key={l.agent_id} style={s.agentRow}>
              <Link href={`/agents/${l.agent_id}?tab=skills`} style={s.agentLink}>
                {l.agent_name}
              </Link>
              <span style={s.position}>{t("stats.position", { n: l.order + 1 })}</span>
              <Badge color={l.enabled ? "var(--ok)" : "var(--text-muted)"}>
                {l.enabled ? t("stats.linkOn") : t("stats.linkOff")}
              </Badge>
            </div>
          ))
        )}
      </section>

      {stats.runs > 0 && (
        <section>
          <h3 style={s.sectionTitle}>{t("stats.findingsTitle")}</h3>
          <p style={s.muted}>{t("stats.findingsLine", stats.findings)}</p>
        </section>
      )}
    </div>
  );
}
