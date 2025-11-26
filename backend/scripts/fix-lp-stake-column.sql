-- Fix pool_liquidity_providers.stake column to use NUMERIC instead of BIGINT
-- PostgreSQL BIGINT max is 2^63-1 = 9223372036854775807
-- But we need to store wei amounts which can be much larger (e.g., 1000000000000000000000 = 1000 BITR)

-- First, check current column type
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_schema = 'oracle' AND table_name = 'pool_liquidity_providers' AND column_name = 'stake';

-- Convert BIGINT to NUMERIC(78, 0) to match other stake columns
ALTER TABLE oracle.pool_liquidity_providers 
ALTER COLUMN stake TYPE NUMERIC(78, 0) USING stake::NUMERIC(78, 0);

-- Verify the change
-- SELECT column_name, data_type, numeric_precision, numeric_scale 
-- FROM information_schema.columns 
-- WHERE table_schema = 'oracle' AND table_name = 'pool_liquidity_providers' AND column_name = 'stake';

