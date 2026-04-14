-- Step 1: Transform existing data to new status values
UPDATE "Voyage" SET status = 'NEW' WHERE status = 'ANALYZING';
UPDATE "Voyage" SET status = 'OFFERED' WHERE status = 'RECOMMENDED';
UPDATE "Voyage" SET status = 'FIXED' WHERE status = 'IN_EXECUTION';

-- Step 2: Update the VoyageStatus enum
-- Remove old values and add new ones
ALTER TYPE "VoyageStatus" RENAME VALUE 'ANALYZING' TO 'NEW';
ALTER TYPE "VoyageStatus" RENAME VALUE 'RECOMMENDED' TO 'OFFERED';

-- Remove IN_EXECUTION (data already migrated to FIXED)
-- Add new terminal statuses
ALTER TYPE "VoyageStatus" ADD VALUE IF NOT EXISTS 'LOST';
ALTER TYPE "VoyageStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "VoyageStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

-- Note: IN_EXECUTION removal requires enum recreation in PostgreSQL
-- Since all IN_EXECUTION rows are already FIXED, we can leave it in the enum
-- Prisma will handle the mapping
