/* AddSkillMenu — the "Add Skill" dropdown (Create / Import), shared by the
   skills grid and the editor's list column. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";

/** The "Add Skill" dropdown — shared by the grid page and the editor's list column. */
export function AddSkillMenu({
  onCreate,
  onImport,
}: {
  onCreate: () => void;
  onImport: () => void;
}) {
  const t = useTranslations("skills");
  return (
    <Dropdown
      width={220}
      align="right"
      trigger={
        <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
          {t("page.addSkill")}
        </Button>
      }
      items={[
        { label: t("page.menu.create"), icon: "Edit", onClick: onCreate },
        { divider: true },
        { label: t("page.menu.import"), icon: "Upload", onClick: onImport },
      ]}
    />
  );
}
