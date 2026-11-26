/* Route: /skills/:id (Skill editor). Thin entry — the screen lives in
   _components/SkillDetailView. */
"use client";

import { useParams } from "next/navigation";
import { SkillDetailView } from "./_components/SkillDetailView";

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <SkillDetailView id={id} />;
}
