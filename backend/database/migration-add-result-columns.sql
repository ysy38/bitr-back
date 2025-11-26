-- Migration: Add missing result columns to match_results table
-- This fixes the "column mr.result_1x2 does not exist" error

-- Add missing columns to oracle.match_results table
ALTER TABLE oracle.match_results 
ADD COLUMN IF NOT EXISTS result_1x2 VARCHAR(10),
ADD COLUMN IF NOT EXISTS result_ou25 VARCHAR(10),
ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_match_results_result_1x2 ON oracle.match_results(result_1x2);
CREATE INDEX IF NOT EXISTS idx_match_results_result_ou25 ON oracle.match_results(result_ou25);
CREATE INDEX IF NOT EXISTS idx_match_results_finished_at ON oracle.match_results(finished_at);

-- Update existing records to populate the new columns based on the existing 'result' column
-- This is a one-time migration to backfill data
UPDATE oracle.match_results 
SET 
  result_1x2 = result,
  result_ou25 = CASE 
    WHEN home_score IS NOT NULL AND away_score IS NOT NULL THEN
      CASE WHEN (home_score + away_score) > 2.5 THEN 'Over' ELSE 'Under' END
    ELSE NULL
  END
WHERE result IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN oracle.match_results.result_1x2 IS '1X2 result: 1 (Home), X (Draw), 2 (Away)';
COMMENT ON COLUMN oracle.match_results.result_ou25 IS 'Over/Under 2.5 result: Over or Under';
COMMENT ON COLUMN oracle.match_results.finished_at IS 'When the match finished';
