-- AlterTable
ALTER TABLE "ChapterAsset" ADD COLUMN "isTranslated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ChapterPageHistory" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterPageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChapterPageHistory_assetId_createdAt_idx" ON "ChapterPageHistory"("assetId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChapterPageHistory" ADD CONSTRAINT "ChapterPageHistory_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterPageHistory" ADD CONSTRAINT "ChapterPageHistory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ChapterAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
