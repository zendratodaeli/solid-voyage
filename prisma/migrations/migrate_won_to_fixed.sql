-- Migration: Rename status "WON" to "FIXED" in CargoInquiry table
-- This aligns commercial pipeline terminology with operational voyage status terminology
-- Run: npx prisma db execute --file prisma/migrations/migrate_won_to_fixed.sql

UPDATE "CargoInquiry" SET status = 'FIXED' WHERE status = 'WON';
