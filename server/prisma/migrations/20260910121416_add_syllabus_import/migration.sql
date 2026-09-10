-- CreateTable
CREATE TABLE "syllabus_imports" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "characterCount" INTEGER NOT NULL DEFAULT 0,
    "appliedAt" TIMESTAMP(3),
    "subjectsCreated" INTEGER NOT NULL DEFAULT 0,
    "topicsCreated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syllabus_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "syllabus_imports_examId_idx" ON "syllabus_imports"("examId");

-- AddForeignKey
ALTER TABLE "syllabus_imports" ADD CONSTRAINT "syllabus_imports_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
