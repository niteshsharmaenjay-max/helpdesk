-- AlterTable
ALTER TABLE "Message" ADD COLUMN "providerMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_providerMessageId_key" ON "Message"("providerMessageId");
