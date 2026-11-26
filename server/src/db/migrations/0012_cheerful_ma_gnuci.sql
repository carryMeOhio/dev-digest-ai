-- skill_versions becomes a full content snapshot (name/description/type/body).
-- drizzle-kit emitted ADD COLUMN ... NOT NULL directly, which fails on any
-- database that already holds version rows. Add nullable, backfill from the
-- parent skill (the best record we have of those fields), then tighten.
ALTER TABLE "skill_versions" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "restored_from" integer;--> statement-breakpoint
UPDATE "skill_versions" AS sv
SET "name" = s."name", "description" = s."description", "type" = s."type"
FROM "skills" AS s
WHERE sv."skill_id" = s."id";--> statement-breakpoint
ALTER TABLE "skill_versions" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_versions" ALTER COLUMN "description" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_versions" ALTER COLUMN "type" SET NOT NULL;
