/* ConventionsView — /repos/:repoId/conventions. Run/re-run extraction, review
   each grounded candidate (accept/reject/edit), and turn the accepted ones
   into a `repo-conventions` skill via CreateConventionSkillModal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import {
  useConventions,
  useExtractConventions,
  useRejectConvention,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "../ConventionCard";
import { CreateConventionSkillModal } from "../CreateConventionSkillModal";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const reject = useRejectConvention(repoId);

  const [creatingSkill, setCreatingSkill] = React.useState(false);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const list = data ?? [];
  const accepted = list.filter((c) => c.accepted);
  const hasCandidates = list.length > 0;
  const repoLabel = activeRepo?.full_name ?? t("page.repoFallback");

  const runExtraction = () => {
    extract.mutate(undefined, {
      onError: (err) => {
        const message = err instanceof ApiError ? err.message : t("page.extractionFailed");
        toast.error(`${t("page.extractionFailed")}: ${message}`);
      },
    });
  };

  return (
    <AppShell crumb={crumb}>
      {creatingSkill && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoFullName={activeRepo?.full_name}
          accepted={accepted}
          onClose={() => setCreatingSkill(false)}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              {repoLabel}
            </h1>
            <p style={s.subtitle}>
              {hasCandidates ? t("page.acceptedCount", { accepted: accepted.length, total: list.length }) : t("page.subtitle")}
            </p>
          </div>
          {!isLoading && !isError && (
            <div style={s.actions}>
              <Button
                kind="secondary"
                icon="RefreshCw"
                loading={extract.isPending}
                disabled={extract.isPending}
                onClick={runExtraction}
              >
                {extract.isPending
                  ? t("page.scanning")
                  : hasCandidates
                    ? t("page.rescan")
                    : t("page.runExtraction")}
              </Button>
              <Button
                kind="primary"
                icon="Sparkles"
                disabled={accepted.length === 0}
                onClick={() => setCreatingSkill(true)}
              >
                {t("card.acceptAsSkill")}
              </Button>
            </div>
          )}
        </div>

        {isLoading && (
          <div style={s.list}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}

        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}

        {!isLoading && !isError && !hasCandidates && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={runExtraction}
            ctaLoading={extract.isPending}
          />
        )}

        {!isLoading && !isError && hasCandidates && (
          <div style={s.list}>
            {list.map((c) => (
              <ConventionCard
                key={c.id}
                convention={c}
                repoFullName={activeRepo?.full_name}
                defaultBranch={activeRepo?.default_branch}
                pending={update.isPending && update.variables?.id === c.id}
                onAccept={() => update.mutate({ id: c.id, patch: { accepted: true } })}
                onReject={() => reject.mutate(c.id)}
                onSaveRule={(rule) => update.mutate({ id: c.id, patch: { rule } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
