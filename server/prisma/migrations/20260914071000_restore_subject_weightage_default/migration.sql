-- Reverts 20260913061500_optional_subject_weightage at the database level, so
-- the schema matches the reverted application code.
--
-- An applied migration is never deleted - that would leave the recorded history
-- pointing at a folder that no longer exists - so the undo is a forward
-- migration instead.

-- Subjects with no supplied weightage go back to the previous default.
UPDATE "subjects" SET "weightage" = 25 WHERE "weightage" IS NULL;

ALTER TABLE "subjects" ALTER COLUMN "weightage" SET DEFAULT 25,
ALTER COLUMN "weightage" SET NOT NULL;

-- Plan items no longer store why they were chosen.
ALTER TABLE "study_plan_items" DROP COLUMN IF EXISTS "reason";
