const db = require('../db/db');
const { ethers } = require('ethers');

class FixtureMappingMaintainer {
  constructor() {
    this.isRunning = false;
  }

  async runOnce() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      console.log('🛠️ Running FixtureMappingMaintainer once...');
      const fixed = await this.enrichMappingsFromPools();
      const fixedTitles = await this.backfillReadableOutcomes();
      console.log(`✅ Maintainer completed. Enriched: ${fixed}, Backfilled readable outcomes: ${fixedTitles}`);
    } catch (e) {
      console.error('❌ Maintainer error:', e.message);
    } finally {
      this.isRunning = false;
    }
  }

  async start(intervalMs = 5 * 60 * 1000) {
    if (this.isRunning) return;
    console.log('🔁 Starting FixtureMappingMaintainer daemon...');
    this.isRunning = true;
    const loop = async () => {
      try {
        await this.enrichMappingsFromPools();
        await this.backfillReadableOutcomes();
      } catch (e) {
        console.error('❌ Maintainer loop error:', e.message);
      } finally {
        if (this.isRunning) setTimeout(loop, intervalMs);
      }
    };
    loop();
  }

  stop() {
    this.isRunning = false;
  }

  async ensureColumns() {
    await db.query(`
      DO $$ BEGIN
        ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS predicted_outcome TEXT;
        ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS readable_outcome TEXT;
        ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS market_type TEXT;
        ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS odds_decimal NUMERIC;
        ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS creator_stake_wei NUMERIC;
        ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS payment_token TEXT;
        ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS use_bitr BOOLEAN;
        ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS user_position TEXT;
        ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS match_date TIMESTAMP;
      EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    `);
  }

  async enrichMappingsFromPools() {
    await this.ensureColumns();

    // Join pools with mappings; fill missing mapping fields from pools
    const res = await db.query(`
      SELECT p.market_id, p.fixture_id, p.odds, p.creator_stake, p.use_bitr, p.league,
             p.event_start_time, p.category,
             fm.id AS mapping_id, fm.market_id_hash, fm.fixture_id AS fm_fixture_id,
             fm.home_team, fm.away_team, fm.league_name, fm.predicted_outcome,
             fm.readable_outcome, fm.odds_decimal, fm.creator_stake_wei
      FROM oracle.pools p
      LEFT JOIN oracle.fixture_mappings fm ON p.market_id = fm.market_id_hash
      WHERE p.pool_id IS NOT NULL
    `);

    let updated = 0;
    for (const row of res.rows) {
      // If no mapping, create minimal entry
      if (!row.mapping_id) {
        // Skip if no fixture_id (required field)
        if (!row.fixture_id) {
          console.log(`⏭️ Skipping pool ${row.pool_id} - no fixture_id`);
          continue;
        }
        
        // Try to get team names from fixtures table using fixture_id if present
        let home = null, away = null;
        if (row.fixture_id) {
          try {
            const fr = await db.query('SELECT home_team, away_team, league_name, match_date FROM oracle.fixtures WHERE id = $1', [row.fixture_id]);
            if (fr.rows.length) {
              home = fr.rows[0].home_team;
              away = fr.rows[0].away_team;
            }
          } catch (_) {}
        }
        await db.query(
          `INSERT INTO oracle.fixture_mappings (market_id_hash, fixture_id, home_team, away_team, league_name, odds_decimal, creator_stake_wei, match_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7, to_timestamp($8))
           ON CONFLICT (market_id_hash) DO NOTHING`,
          [row.market_id, row.fixture_id, home, away, row.league || null, row.odds ? Number(row.odds) / 100 : null, row.creator_stake || null, row.event_start_time || null]
        );
        updated++;
        continue;
      }

      // Upsert enrich fields when missing
      const needsUpdate = (
        (!row.odds_decimal && row.odds) ||
        (!row.creator_stake_wei && row.creator_stake) ||
        (!row.fm_fixture_id && row.fixture_id)
      );
      if (needsUpdate) {
        await db.query(
          `UPDATE oracle.fixture_mappings
           SET odds_decimal = COALESCE(odds_decimal, $1),
               creator_stake_wei = COALESCE(creator_stake_wei, $2),
               fixture_id = COALESCE(fixture_id, $3),
               league_name = COALESCE(league_name, $4),
               match_date = COALESCE(match_date, to_timestamp($5))
           WHERE market_id_hash = $6`,
          [row.odds ? Number(row.odds) / 100 : null, row.creator_stake || null, row.fixture_id || null, row.league || null, row.event_start_time || null, row.market_id]
        );
        updated++;
      }
    }

    return updated;
  }

  async backfillReadableOutcomes() {
    // Fill readable_outcome, market_type from predicted_outcome hash using simple heuristics
    const res = await db.query(`
      SELECT market_id_hash, predicted_outcome, home_team, away_team
      FROM oracle.fixture_mappings
      WHERE (readable_outcome IS NULL OR readable_outcome = '') AND predicted_outcome IS NOT NULL
    `);

    let count = 0;
    for (const row of res.rows) {
      const decoded = await this.tryDecode(row.predicted_outcome);
      if (!decoded) continue;
      const lower = decoded.toLowerCase();
      let readable = decoded;
      let marketType = 'Prediction';
      if (row.home_team && row.away_team) {
        if (['1','home'].includes(lower)) {
          readable = `${row.home_team} wins`;
          marketType = 'Match Result';
        } else if (['2','away'].includes(lower)) {
          readable = `${row.away_team} wins`;
          marketType = 'Match Result';
        } else if (['x','draw'].includes(lower)) {
          readable = `Draw between ${row.home_team} and ${row.away_team}`;
          marketType = 'Match Result';
        } else if (lower.includes('over')) {
          readable = `Over 2.5 goals in ${row.home_team} vs ${row.away_team}`;
          marketType = 'Goals Over/Under';
        } else if (lower.includes('under')) {
          readable = `Under 2.5 goals in ${row.home_team} vs ${row.away_team}`;
          marketType = 'Goals Over/Under';
        }
      }
      await db.query(
        `UPDATE oracle.fixture_mappings SET readable_outcome = $1, market_type = $2 WHERE market_id_hash = $3`,
        [readable, marketType, row.market_id_hash]
      );
      count++;
    }

    return count;
  }

  async tryDecode(hash) {
    if (!hash || typeof hash !== 'string' || !hash.startsWith('0x')) return null;
    const candidates = [
      '1','2','x','home','away','draw','over','under','o','u','btts','both teams to score','yes','no','over_25_goals','under_25_goals','over_15_goals','under_15_goals','over_35_goals','under_35_goals'
    ];
    for (const v of candidates) {
      const h = ethers.keccak256(ethers.toUtf8Bytes(v));
      if (h.toLowerCase() === hash.toLowerCase()) return v;
    }
    return null;
  }
}

module.exports = FixtureMappingMaintainer;
