-- Plan items remember why they were chosen.
ALTER TABLE "study_plan_items" ADD COLUMN "reason" TEXT;

-- Weightage becomes "supplied or not", instead of silently defaulting to 25.
ALTER TABLE "subjects" ALTER COLUMN "weightage" DROP NOT NULL,
ALTER COLUMN "weightage" DROP DEFAULT;

-- Backfill: an exam whose subjects all carry the same weightage tells the
-- engine nothing about relative importance - it is either the old default that
-- nobody typed, or a genuinely flat paper. Either way it must not be presented
-- as evidence, and dropping a constant changes no ranking. Exams with varying
-- weightage (the built-in templates) keep their real numbers.
UPDATE "subjects" s
SET "weightage" = NULL
WHERE EXISTS (
  SELECT 1
  FROM "subjects" peer
  WHERE peer."examId" = s."examId"
  GROUP BY peer."examId"
  HAVING COUNT(DISTINCT peer."weightage") <= 1
);
