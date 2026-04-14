-- Step 2: Transform existing data to new values
UPDATE "Voyage" SET status = 'NEW' WHERE status = 'ANALYZING';
UPDATE "Voyage" SET status = 'OFFERED' WHERE status = 'RECOMMENDED';
UPDATE "Voyage" SET status = 'FIXED' WHERE status = 'IN_EXECUTION';
