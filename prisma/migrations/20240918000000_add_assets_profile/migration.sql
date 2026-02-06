-- CreateTable
CREATE TABLE "ChapterAsset" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterPageJson" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "jsonPath" TEXT NOT NULL,
    "jsonFileName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterPageJson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterUploadBatch" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterUploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "targetUserId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChapterAsset_chapterId_pageIndex_key" ON "ChapterAsset"("chapterId", "pageIndex");

-- CreateIndex
CREATE INDEX "ChapterAsset_chapterId_pageIndex_idx" ON "ChapterAsset"("chapterId", "pageIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterPageJson_assetId_key" ON "ChapterPageJson"("assetId");

-- AddForeignKey
ALTER TABLE "ChapterAsset" ADD CONSTRAINT "ChapterAsset_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterPageJson" ADD CONSTRAINT "ChapterPageJson_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterPageJson" ADD CONSTRAINT "ChapterPageJson_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ChapterAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterUploadBatch" ADD CONSTRAINT "ChapterUploadBatch_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterUploadBatch" ADD CONSTRAINT "ChapterUploadBatch_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
