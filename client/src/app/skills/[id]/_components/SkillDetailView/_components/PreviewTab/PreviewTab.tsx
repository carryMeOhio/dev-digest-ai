/* PreviewTab — the saved skill rendered as Markdown, and verbatim as the block
   an agent's prompt receives. Shows the SAVED skill, not unsaved Config edits. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { approxTokens } from "../ConfigTab/helpers";
import { promptBlock } from "./helpers";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const block = promptBlock(skill.name, skill.body);

  return (
    <div style={s.wrap}>
      <section style={s.section}>
        <div style={s.label}>{t("previewTab.rendered")}</div>
        <div style={s.rendered}>
          <Markdown>{skill.body}</Markdown>
        </div>
      </section>

      <section style={s.section}>
        <div style={s.label}>
          {t("previewTab.prompt")}
          <span style={s.tokens}>{t("previewTab.tokens", { count: approxTokens(block) })}</span>
        </div>
        <p style={s.hint}>{t("previewTab.promptHint")}</p>
        <pre className="mono" style={s.pre}>
          {block}
        </pre>
      </section>
    </div>
  );
}
