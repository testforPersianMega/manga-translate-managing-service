-- CreateTable
CREATE TABLE "UploadJob" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "progressCurrent" INTEGER,
    "progressTotal" INTEGER,
    "messageFa" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadJob_chapterId_userId_createdAt_idx" ON "UploadJob"("chapterId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadJob_userId_status_idx" ON "UploadJob"("userId", "status");

-- AddForeignKey
ALTER TABLE "UploadJob" ADD CONSTRAINT "UploadJob_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadJob" ADD CONSTRAINT "UploadJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
