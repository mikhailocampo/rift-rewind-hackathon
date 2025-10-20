-- ============================================
-- Migration: 001 - BRONZE Layer Schema
-- Purpose: Raw match data storage from Riot Match-V5 API
-- Tables: match (enhanced), match_participant, match_team,
--         match_timeline_frame, match_timeline_event
-- ============================================

-- ============================================
-- 1. Enhance existing `match` table
-- ============================================

-- Add new columns for denormalized match metadata
ALTER TABLE match
  ADD COLUMN IF NOT EXISTS game_mode TEXT,
  ADD COLUMN IF NOT EXISTS queue_id INT,
  ADD COLUMN IF NOT EXISTS map_id INT,
  ADD COLUMN IF NOT EXISTS game_version TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INT,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS winning_team_id INT;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_match_started_at ON match(started_at);
CREATE INDEX IF NOT EXISTS idx_match_queue_id ON match(queue_id);
CREATE INDEX IF NOT EXISTS idx_match_duration ON match(duration_seconds);
CREATE INDEX IF NOT EXISTS idx_match_winning_team ON match(winning_team_id);

COMMENT ON COLUMN match.game_mode IS 'Game mode: CLASSIC, ARAM, ARENA, etc.';
COMMENT ON COLUMN match.queue_id IS 'Queue ID: 420=ranked solo, 400=draft, 450=ARAM';
COMMENT ON COLUMN match.map_id IS 'Map ID: 11=Summoners Rift, 12=Howling Abyss';
COMMENT ON COLUMN match.game_version IS 'Game patch version (e.g., 15.20.717.2831)';
COMMENT ON COLUMN match.duration_seconds IS 'Match duration in seconds';
COMMENT ON COLUMN match.winning_team_id IS 'Winning team: 100 or 200';

-- ============================================
-- 2. Create `match_participant` table
-- ============================================

CREATE TABLE IF NOT EXISTS match_participant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  player_profile_id UUID REFERENCES player_profile(id),

  -- Identifiers
  participant_id INT NOT NULL,  -- 1-10 in-game participant ID
  puuid TEXT NOT NULL,
  team_id INT NOT NULL,         -- 100 or 200

  -- Champion/Build
  champion_id INT NOT NULL,
  champion_name TEXT NOT NULL,
  team_position TEXT,            -- TOP, JUNGLE, MID, ADC, SUPPORT
  individual_position TEXT,
  summoner_spells INT[],         -- [summoner1Id, summoner2Id]
  items INT[],                   -- [item0, item1, item2, item3, item4, item5, item6]

  -- Core stats (denormalized for fast queries)
  kills INT NOT NULL DEFAULT 0,
  deaths INT NOT NULL DEFAULT 0,
  assists INT NOT NULL DEFAULT 0,
  gold_earned INT NOT NULL DEFAULT 0,
  total_damage_to_champions INT NOT NULL DEFAULT 0,
  cs_total INT NOT NULL DEFAULT 0,
  champ_level INT NOT NULL DEFAULT 1,
  vision_score INT NOT NULL DEFAULT 0,
  win BOOLEAN NOT NULL,

  -- Runes/Perks (for meta analysis)
  primary_rune_style INT,
  sub_rune_style INT,
  stat_perks JSONB,

  -- **CRITICAL: Store full challenges for adhoc SILVER queries**
  -- Contains 128+ metrics like goldPerMinute, takedownsAfterGainingLevelAdvantage, etc.
  challenges JSONB,

  -- Raw participant data (complete API response for reprocessing)
  raw_data JSONB NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(match_id, participant_id)
);

-- Indexes for common query patterns
CREATE INDEX idx_match_participant_match ON match_participant(match_id);
CREATE INDEX idx_match_participant_player ON match_participant(player_profile_id);
CREATE INDEX idx_match_participant_champion ON match_participant(champion_id);
CREATE INDEX idx_match_participant_position ON match_participant(team_position);
CREATE INDEX idx_match_participant_puuid ON match_participant(puuid);
CREATE INDEX idx_match_participant_team ON match_participant(match_id, team_id);
CREATE INDEX idx_match_participant_win ON match_participant(win);

-- GIN index for querying JSONB challenges (adhoc metric discovery)
CREATE INDEX idx_match_participant_challenges ON match_participant USING GIN (challenges);

COMMENT ON TABLE match_participant IS 'Individual player performance in a match (BRONZE layer)';
COMMENT ON COLUMN match_participant.challenges IS 'JSONB with 128+ metrics from Riot API for adhoc analytics';
COMMENT ON COLUMN match_participant.raw_data IS 'Complete participant object from API for reprocessing';

-- ============================================
-- 3. Create `match_team` table
-- ============================================

CREATE TABLE IF NOT EXISTS match_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  team_id INT NOT NULL,  -- 100 or 200
  win BOOLEAN NOT NULL,

  -- Objectives (counts)
  barons INT NOT NULL DEFAULT 0,
  dragons INT NOT NULL DEFAULT 0,
  towers INT NOT NULL DEFAULT 0,
  inhibitors INT NOT NULL DEFAULT 0,
  rift_heralds INT NOT NULL DEFAULT 0,

  -- Bans (array of champion IDs)
  bans INT[],

  -- Raw team data (complete API response)
  raw_data JSONB NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(match_id, team_id)
);

CREATE INDEX idx_match_team_match ON match_team(match_id);
CREATE INDEX idx_match_team_win ON match_team(win);

COMMENT ON TABLE match_team IS 'Team-level objectives and bans (BRONZE layer)';

-- ============================================
-- 4. Create `match_timeline_frame` table
-- ============================================

CREATE TABLE IF NOT EXISTS match_timeline_frame (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  frame_number INT NOT NULL,
  timestamp_ms BIGINT NOT NULL,

  participant_id INT NOT NULL,

  -- Economy tracking (for gold advantage analysis)
  total_gold INT NOT NULL DEFAULT 0,
  current_gold INT NOT NULL DEFAULT 0,
  gold_per_second INT NOT NULL DEFAULT 0,
  xp INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,

  -- Position tracking (for heatmaps, roaming analysis)
  position_x INT,
  position_y INT,

  -- Champion stats at this frame (armor, damage, health, etc.)
  champion_stats JSONB NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(match_id, frame_number, participant_id)
);

CREATE INDEX idx_timeline_frame_match ON match_timeline_frame(match_id);
CREATE INDEX idx_timeline_frame_timestamp ON match_timeline_frame(match_id, timestamp_ms);
CREATE INDEX idx_timeline_frame_participant ON match_timeline_frame(match_id, participant_id);
CREATE INDEX idx_timeline_frame_number ON match_timeline_frame(match_id, frame_number);

COMMENT ON TABLE match_timeline_frame IS 'Minute-by-minute participant stats (every 60 seconds)';
COMMENT ON COLUMN match_timeline_frame.champion_stats IS 'JSONB with armor, damage, health, etc. at this frame';

-- ============================================
-- 5. Create `match_timeline_event` table
-- ============================================

CREATE TABLE IF NOT EXISTS match_timeline_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,

  frame_number INT NOT NULL,
  timestamp_ms BIGINT NOT NULL,
  event_type TEXT NOT NULL,  -- CHAMPION_KILL, WARD_PLACED, BUILDING_KILL, ELITE_MONSTER_KILL, etc.

  -- Participants involved
  participant_id INT,           -- Generic participant (for items, wards, level ups)
  killer_participant_id INT,    -- For CHAMPION_KILL
  victim_participant_id INT,    -- For CHAMPION_KILL
  assisting_participant_ids INT[],  -- For CHAMPION_KILL

  -- Position data (when available)
  position_x INT,
  position_y INT,

  -- Event-specific fields (nullable, depends on event_type)
  building_type TEXT,           -- TOWER_BUILDING, INHIBITOR_BUILDING
  tower_type TEXT,              -- OUTER_TURRET, INNER_TURRET, BASE_TURRET, NEXUS_TURRET
  lane_type TEXT,               -- TOP_LANE, MID_LANE, BOT_LANE
  monster_type TEXT,            -- BARON_NASHOR, DRAGON, RIFTHERALD
  monster_sub_type TEXT,        -- FIRE_DRAGON, EARTH_DRAGON, ELDER_DRAGON, etc.
  item_id INT,                  -- For ITEM_PURCHASED, ITEM_DESTROYED, ITEM_SOLD
  skill_slot INT,               -- For SKILL_LEVEL_UP (1-4)
  ward_type TEXT,               -- For WARD_PLACED (YELLOW_TRINKET, CONTROL_WARD, etc.)

  -- Raw event data (complete API response)
  raw_data JSONB NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_timeline_event_match ON match_timeline_event(match_id);
CREATE INDEX idx_timeline_event_type ON match_timeline_event(match_id, event_type);
CREATE INDEX idx_timeline_event_timestamp ON match_timeline_event(match_id, timestamp_ms);
CREATE INDEX idx_timeline_event_participant ON match_timeline_event(match_id, participant_id);
CREATE INDEX idx_timeline_event_killer ON match_timeline_event(match_id, killer_participant_id);
CREATE INDEX idx_timeline_event_victim ON match_timeline_event(match_id, victim_participant_id);
CREATE INDEX idx_timeline_event_frame ON match_timeline_event(match_id, frame_number);

-- GIN index for querying JSONB raw_data
CREATE INDEX idx_timeline_event_raw_data ON match_timeline_event USING GIN (raw_data);

COMMENT ON TABLE match_timeline_event IS 'All timeline events from Riot API (BRONZE layer)';
COMMENT ON COLUMN match_timeline_event.event_type IS 'Event types: CHAMPION_KILL, WARD_PLACED, BUILDING_KILL, ELITE_MONSTER_KILL, ITEM_PURCHASED, etc.';

-- ============================================
-- 6. Enhance `player_profile` table
-- ============================================

-- Add unique index on puuid for efficient participant linking
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_profile_puuid
  ON player_profile(puuid)
  WHERE puuid IS NOT NULL;

-- ============================================
-- 7. Create helper function for team membership
-- ============================================

-- Helper function to determine if participant is on a team
CREATE OR REPLACE FUNCTION is_same_team(participant_id1 INT, participant_id2 INT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Participants 1-5 are team 100, 6-10 are team 200
  RETURN (participant_id1 - 1) / 5 = (participant_id2 - 1) / 5;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION is_same_team IS 'Check if two participant IDs are on the same team';

-- ============================================
-- Migration Complete!
-- ============================================

-- Summary of changes:
-- [✓] Enhanced match table with 7 new columns
-- [✓] Created match_participant table (per-player performance)
-- [✓] Created match_team table (team objectives)
-- [✓] Created match_timeline_frame table (minute-by-minute stats)
-- [✓] Created match_timeline_event table (all events)
-- [✓] Added unique index on player_profile.puuid
-- [✓] Created helper function is_same_team()

-- Next steps:
-- 1. Run migration: psql -h <host> -U <user> -d <database> -f 001_bronze_schema.sql
-- 2. Verify tables created: \dt match_*
-- 3. Proceed to 002_silver_schema.sql
