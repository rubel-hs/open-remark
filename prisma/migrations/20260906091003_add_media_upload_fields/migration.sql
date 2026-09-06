-- CreateEnum
CREATE TYPE "MediaProvider" AS ENUM ('IMGBB', 'CATBOX', 'IMGUR');

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "mediaApiKey" TEXT,
ADD COLUMN     "mediaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mediaMaxBytes" INTEGER NOT NULL DEFAULT 5242880,
ADD COLUMN     "mediaMaxImages" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "mediaProvider" "MediaProvider" NOT NULL DEFAULT 'IMGBB';
