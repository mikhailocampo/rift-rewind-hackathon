-- ============================================
-- Migration: 002 - SILVER Layer Schema
-- Purpose: Derived analytics computed from BRONZE layer
-- Tables: match_participant_analytics, match_timeline_analytics,
--         player_rolling_analytics
-- Dependencies: Requires 001_bronze_schema.sql
-- ============================================

-- ============================================
-- 1. Create `match_participant_analytics` table
-- ============================================

CREATE TABLE IF NOT EXISTS match_participant_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_participant_id UUID NOT NULL REFERENCES match_participant(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  player_profile_id UUID REFERENCES player_profile(id),

  -- ============================================
  -- ECONOMY METRICS (Gold Efficiency, Tempo)
  -- ============================================
  gold_per_minute DECIMAL(10,2),
  cs_per_minute DECIMAL(10,2),
  damage_per_minute DECIMAL(10,2),

  -- Lane advantages (vs direct opponent)
  gold_advantage_at_10 INT,      -- Gold lead at 10 min
  gold_advantage_at_15 INT,      -- Gold lead at 15 min
  cs_advantage_at_10 INT,        -- CS lead at 10 min
  xp_advantage_at_15 INT,        -- XP lead at 15 min

  -- From challenges
  early_laning_gold_exp_advantage DECIMAL(10,2),
  bounty_gold INT,

  -- ============================================
  -- OBJECTIVES/MACRO METRICS
  -- ============================================
  objective_participation_rate DECIMAL(5,2),  -- % of team objectives participated in
  takedowns_after_level_advantage INT,        -- From challenges
  baron_participation INT,                     -- Times participated in baron takedown
  dragon_participation INT,
  tower_participation INT,
  first_turret_contribution BOOLEAN,          -- Helped with first turret

  -- Composite macro quality score
  macro_score DECIMAL(10,2),

  -- ============================================
  -- MAP CONTROL/VISION METRICS
  -- ============================================
  vision_score_per_minute DECIMAL(10,2),
  control_ward_uptime_percent DECIMAL(5,2),   -- From challenges
  stealth_wards_placed INT,
  wards_cleared INT,
  vision_advantage_vs_opponent DECIMAL(10,2), -- From challenges

  -- Roaming (calculated from timeline)
  roam_efficiency_score DECIMAL(10,2),        -- Cross-lane kills/assists per minute

  -- ============================================
  -- ERROR RATE METRICS
  -- ============================================
  deaths_per_minute DECIMAL(10,2),
  unforced_death_rate DECIMAL(5,2),           -- % deaths without nearby teammates
  kill_participation DECIMAL(5,2),            -- From challenges
  survival_time_percent DECIMAL(5,2),         -- (duration - time_dead) / duration
  tempo_loss_on_death_avg INT,                -- Avg gold/xp lost per death
  wave_management_score DECIMAL(10,2),        -- CS efficiency (vs theoretical max)

  -- ============================================
  -- COMPOSITE SCORES (0-100 normalized)
  -- ============================================
  economy_score DECIMAL(5,2),                 -- Weighted combo of economy metrics
  objectives_score DECIMAL(5,2),              -- Weighted combo of objective metrics
  map_control_score DECIMAL(5,2),             -- Weighted combo of vision metrics
  error_rate_score DECIMAL(5,2),              -- Inverted error metrics (lower errors = higher score)
  overall_performance_score DECIMAL(5,2),     -- Weighted average of 4 factors

  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(match_participant_id)
);

-- Indexes for common query patterns
CREATE INDEX idx_participant_analytics_match ON match_participant_analytics(match_id);
CREATE INDEX idx_participant_analytics_player ON match_participant_analytics(player_profile_id);
CREATE INDEX idx_participant_analytics_overall_score ON match_participant_analytics(overall_performance_score DESC);
CREATE INDEX idx_participant_analytics_economy ON match_participant_analytics(economy_score DESC);
CREATE INDEX idx_participant_analytics_objectives ON match_participant_analytics(objectives_score DESC);
CREATE INDEX idx_participant_analytics_map_control ON match_participant_analytics(map_control_score DESC);
CREATE INDEX idx_participant_analytics_error_rate ON match_participant_analytics(error_rate_score DESC);
CREATE INDEX idx_participant_analytics_computed_at ON match_participant_analytics(computed_at);

COMMENT ON TABLE match_participant_analytics IS 'Derived analytics for player performance (SILVER layer)';
COMMENT ON COLUMN match_participant_analytics.economy_score IS 'Normalized 0-100 score for economy/tempo performance';
COMMENT ON COLUMN match_participant_analytics.objectives_score IS 'Normalized 0-100 score for macro/objective play';
COMMENT ON COLUMN match_participant_analytics.map_control_score IS 'Normalized 0-100 score for vision/roaming';
COMMENT ON COLUMN match_participant_analytics.error_rate_score IS 'Normalized 0-100 score (inverted - lower errors = higher)';

-- ============================================
-- 2. Create `match_timeline_analytics` table
-- ============================================

CREATE TABLE IF NOT EXISTS match_timeline_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,

  -- First blood/objective timing
  first_blood_timestamp_ms BIGINT,
  first_blood_team_id INT,
  first_blood_killer_participant_id INT,

  first_tower_timestamp_ms BIGINT,
  first_tower_team_id INT,

  first_dragon_timestamp_ms BIGINT,
  first_dragon_team_id INT,

  first_baron_timestamp_ms BIGINT,
  first_baron_team_id INT,

  -- Objective contest quality (derived from timeline)
  avg_players_near_dragon_kills DECIMAL(5,2),  -- Team coordination
  avg_players_near_baron_kills DECIMAL(5,2),
  objective_steals_count INT,

  -- Tempo shifts (key momentum changes)
  gold_swing_events JSONB,  -- [{timestamp, team_id, gold_delta, reason}, ...]
  ace_timestamps BIGINT[],

  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(match_id)
);

CREATE INDEX idx_timeline_analytics_match ON match_timeline_analytics(match_id);
CREATE INDEX idx_timeline_analytics_first_blood ON match_timeline_analytics(first_blood_timestamp_ms);

COMMENT ON TABLE match_timeline_analytics IS 'Match-level tempo and objective timing analytics (SILVER layer)';
COMMENT ON COLUMN match_timeline_analytics.gold_swing_events IS 'JSONB array of significant gold lead changes';

-- ============================================
-- 3. Create `player_rolling_analytics` table
-- ============================================

CREATE TABLE IF NOT EXISTS player_rolling_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id UUID NOT NULL REFERENCES player_profile(id),

  -- Window configuration
  match_count INT NOT NULL,              -- Last N matches (e.g., 20)
  champion_id INT,                       -- NULL = all champions
  queue_id INT,                          -- NULL = all queues
  team_position TEXT,                    -- NULL = all positions

  -- Averaged 4 factors
  avg_economy_score DECIMAL(5,2),
  avg_objectives_score DECIMAL(5,2),
  avg_map_control_score DECIMAL(5,2),
  avg_error_rate_score DECIMAL(5,2),
  avg_overall_performance DECIMAL(5,2),

  -- Win rate
  win_rate DECIMAL(5,2),
  total_matches INT,

  -- Trends (comparing first half vs second half of window)
  economy_trend TEXT,           -- 'improving', 'declining', 'stable'
  objectives_trend TEXT,
  map_control_trend TEXT,
  error_rate_trend TEXT,

  -- Match IDs included in this aggregate
  match_ids UUID[],

  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create unique index with expressions (can't use COALESCE in table-level UNIQUE constraint)
CREATE UNIQUE INDEX idx_rolling_analytics_unique
  ON player_rolling_analytics(
    player_profile_id,
    match_count,
    COALESCE(champion_id, -1),
    COALESCE(queue_id, -1),
    COALESCE(team_position, '')
  );

CREATE INDEX idx_rolling_analytics_player ON player_rolling_analytics(player_profile_id);
CREATE INDEX idx_rolling_analytics_champion ON player_rolling_analytics(champion_id) WHERE champion_id IS NOT NULL;
CREATE INDEX idx_rolling_analytics_queue ON player_rolling_analytics(queue_id) WHERE queue_id IS NOT NULL;
CREATE INDEX idx_rolling_analytics_position ON player_rolling_analytics(team_position) WHERE team_position IS NOT NULL;
CREATE INDEX idx_rolling_analytics_overall_perf ON player_rolling_analytics(avg_overall_performance DESC);

COMMENT ON TABLE player_rolling_analytics IS 'Aggregated analytics across N recent matches per player (SILVER layer)';
COMMENT ON COLUMN player_rolling_analytics.economy_trend IS 'Trend: improving, declining, or stable (first half vs second half)';

-- ============================================
-- 4. Helper functions for BRONZE→SILVER transformations
-- ============================================

-- Calculate distance between two positions
CREATE OR REPLACE FUNCTION calculate_distance(x1 INT, y1 INT, x2 INT, y2 INT)
RETURNS DECIMAL AS $$
BEGIN
  RETURN SQRT(POWER(x2 - x1, 2) + POWER(y2 - y1, 2));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_distance IS 'Calculate Euclidean distance between two map positions';

-- Determine if position is in a specific lane
-- Summoner's Rift map coordinates: ~0-15000 for both x and y
CREATE OR REPLACE FUNCTION get_lane_from_position(x INT, y INT)
RETURNS TEXT AS $$
BEGIN
  -- Simplified lane detection (can be refined with more precise boundaries)
  IF x < 5000 AND y > 10000 THEN
    RETURN 'TOP';
  ELSIF x > 10000 AND y < 5000 THEN
    RETURN 'BOT';
  ELSIF x BETWEEN 5000 AND 10000 AND y BETWEEN 5000 AND 10000 THEN
    RETURN 'MID';
  ELSIF (x < 7500 AND y < 7500) OR (x > 7500 AND y > 7500) THEN
    RETURN 'JUNGLE';
  ELSE
    RETURN 'UNKNOWN';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_lane_from_position IS 'Determine lane from map coordinates (approximate)';

-- Check if two positions are in the same lane
CREATE OR REPLACE FUNCTION is_same_lane(x1 INT, y1 INT, lane TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_lane_from_position(x1, y1) = lane;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION is_same_lane IS 'Check if position coordinates match a given lane';

-- Calculate normalized score (min-max normalization to 0-100)
CREATE OR REPLACE FUNCTION normalize_score(
  value DECIMAL,
  min_val DECIMAL,
  max_val DECIMAL
)
RETURNS DECIMAL AS $$
BEGIN
  IF max_val = min_val THEN
    RETURN 50.0; -- Return middle value if no variance
  END IF;
  RETURN LEAST(100, GREATEST(0, ((value - min_val) / (max_val - min_val) * 100)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalize_score IS 'Normalize a value to 0-100 scale using min-max normalization';

-- Calculate trend from two sets of scores
CREATE OR REPLACE FUNCTION calculate_trend(first_half_avg DECIMAL, second_half_avg DECIMAL, threshold DECIMAL DEFAULT 5.0)
RETURNS TEXT AS $$
BEGIN
  IF second_half_avg - first_half_avg > threshold THEN
    RETURN 'improving';
  ELSIF first_half_avg - second_half_avg > threshold THEN
    RETURN 'declining';
  ELSE
    RETURN 'stable';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_trend IS 'Determine trend (improving/declining/stable) from two averages';

-- ============================================
-- 5. Create view for quick analytics summary
-- ============================================

CREATE OR REPLACE VIEW v_player_recent_performance AS
SELECT
  pp.id AS player_profile_id,
  pp.puuid,
  pp.riot_gamename,
  pp.riot_tagline,
  mpa.match_id,
  m.started_at,
  m.queue_id,
  mp.champion_name,
  mp.team_position,
  mp.kills,
  mp.deaths,
  mp.assists,
  mp.win,
  mpa.economy_score,
  mpa.objectives_score,
  mpa.map_control_score,
  mpa.error_rate_score,
  mpa.overall_performance_score
FROM player_profile pp
JOIN match_participant mp ON mp.player_profile_id = pp.id
JOIN match m ON m.id = mp.match_id
LEFT JOIN match_participant_analytics mpa ON mpa.match_participant_id = mp.id
ORDER BY m.started_at DESC;

COMMENT ON VIEW v_player_recent_performance IS 'Quick view of player performance with analytics scores';

-- ============================================
-- 6. Create materialized view for leaderboard (optional, for performance)
-- ============================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_player_leaderboard AS
SELECT
  pp.id AS player_profile_id,
  pp.puuid,
  pp.riot_gamename,
  pp.riot_tagline,
  COUNT(DISTINCT mp.match_id) AS total_matches,
  AVG(mpa.overall_performance_score) AS avg_performance_score,
  AVG(mpa.economy_score) AS avg_economy_score,
  AVG(mpa.objectives_score) AS avg_objectives_score,
  AVG(mpa.map_control_score) AS avg_map_control_score,
  AVG(mpa.error_rate_score) AS avg_error_rate_score,
  SUM(CASE WHEN mp.win THEN 1 ELSE 0 END)::DECIMAL / COUNT(*) * 100 AS win_rate
FROM player_profile pp
JOIN match_participant mp ON mp.player_profile_id = pp.id
LEFT JOIN match_participant_analytics mpa ON mpa.match_participant_id = mp.id
WHERE mpa.id IS NOT NULL  -- Only include matches with computed analytics
GROUP BY pp.id, pp.puuid, pp.riot_gamename, pp.riot_tagline
HAVING COUNT(DISTINCT mp.match_id) >= 5  -- Minimum 5 matches
ORDER BY avg_performance_score DESC;

CREATE UNIQUE INDEX idx_mv_player_leaderboard_player ON mv_player_leaderboard(player_profile_id);

COMMENT ON MATERIALIZED VIEW mv_player_leaderboard IS 'Leaderboard of players by average performance (refresh periodically)';

-- ============================================
-- Migration Complete!
-- ============================================

-- Summary of changes:
-- [✓] Created match_participant_analytics table (4 factor scores)
-- [✓] Created match_timeline_analytics table (match tempo)
-- [✓] Created player_rolling_analytics table (multi-match aggregates)
-- [✓] Created helper functions for transformations
-- [✓] Created view v_player_recent_performance
-- [✓] Created materialized view mv_player_leaderboard

-- Next steps:
-- 1. Run migration: psql -h <host> -U <user> -d <database> -f 002_silver_schema.sql
-- 2. Verify tables created: \dt match_participant_analytics
-- 3. Implement BRONZE→SILVER transformation queries in analyticsService
-- 4. Schedule periodic refresh of materialized view:
--    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_player_leaderboard;
