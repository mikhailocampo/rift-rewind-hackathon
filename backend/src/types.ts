export interface RiotProfileRequest {
  gameName: string;
  tagLine: string;
}

export interface RiotAccountResponse {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface ProfileData {
  puuid: string;
  riot_gamename: string;
  riot_tagline: string;
  platform_id: string;
  meta: Record<string, any>;
}

export interface ProfileQueryResult {
  success: boolean;
  data?: ProfileData;
  error?: string;
  statusCode?: number;
}

export interface SecretsConfig {
  riot_api_key: string;
}

export enum RiotRegion {
  AMERICAS = 'americas',
  ASIA = 'asia',
  EUROPE = 'europe'
}

export enum RiotPlatform {
  NA1 = 'na1',
  EUW1 = 'euw1',
  EUN1 = 'eun1',
  KR = 'kr',
  JP1 = 'jp1',
  BR1 = 'br1',
  LA1 = 'la1',
  LA2 = 'la2',
  OC1 = 'oc1',
  TR1 = 'tr1',
  RU = 'ru'
}

// ============================================
// Match-V5 API Types
// ============================================

export interface MatchMetadata {
  dataVersion: string;
  matchId: string;
  participants: string[];  // Array of PUUIDs
}

export interface MatchInfo {
  endOfGameResult: string;
  gameCreation: number;
  gameDuration: number;
  gameEndTimestamp: number;
  gameId: number;
  gameMode: string;
  gameName: string;
  gameStartTimestamp: number;
  gameType: string;
  gameVersion: string;
  mapId: number;
  participants: MatchParticipant[];
  platformId: string;
  queueId: number;
  teams: MatchTeam[];
  tournamentCode?: string;
}

export interface MatchParticipant {
  participantId?: number;
  puuid: string;
  summonerId: string;
  summonerName?: string;
  riotIdGameName: string;
  riotIdTagline: string;
  championId: number;
  championName: string;
  teamId: number;
  teamPosition: string;
  individualPosition: string;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  totalMinionsKilled: number;
  champLevel: number;
  visionScore: number;
  win: boolean;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  summoner1Id: number;
  summoner2Id: number;
  perks?: {
    statPerks: {
      defense: number;
      flex: number;
      offense: number;
    };
    styles: Array<{
      description: string;
      selections: Array<{
        perk: number;
        var1: number;
        var2: number;
        var3: number;
      }>;
      style: number;
    }>;
  };
  challenges?: Record<string, any>;  // 128+ challenge metrics
  [key: string]: any;  // Allow additional fields
}

export interface MatchTeam {
  teamId: number;
  win: boolean;
  bans: Array<{
    championId: number;
    pickTurn: number;
  }>;
  objectives: {
    baron: { first: boolean; kills: number };
    champion: { first: boolean; kills: number };
    dragon: { first: boolean; kills: number };
    inhibitor: { first: boolean; kills: number };
    riftHerald: { first: boolean; kills: number };
    tower: { first: boolean; kills: number };
    [key: string]: any;
  };
}

export interface MatchResponse {
  metadata: MatchMetadata;
  info: MatchInfo;
}

export interface TimelineInfo {
  endOfGameResult: string;
  frameInterval: number;
  frames: TimelineFrame[];
  gameId: number;
  participants: Array<{
    participantId: number;
    puuid: string;
  }>;
}

export interface TimelineFrame {
  events: TimelineEvent[];
  participantFrames: Record<string, ParticipantFrame>;
  timestamp: number;
}

export interface ParticipantFrame {
  championStats: {
    abilityHaste: number;
    abilityPower: number;
    armor: number;
    armorPen: number;
    armorPenPercent: number;
    attackDamage: number;
    attackSpeed: number;
    bonusArmorPenPercent: number;
    bonusMagicPenPercent: number;
    ccReduction: number;
    cooldownReduction: number;
    health: number;
    healthMax: number;
    healthRegen: number;
    lifesteal: number;
    magicPen: number;
    magicPenPercent: number;
    magicResist: number;
    movementSpeed: number;
    omnivamp: number;
    physicalVamp: number;
    power: number;
    powerMax: number;
    powerRegen: number;
    spellVamp: number;
  };
  currentGold: number;
  goldPerSecond: number;
  level: number;
  position: {
    x: number;
    y: number;
  };
  totalGold: number;
  xp: number;
  [key: string]: any;
}

export interface TimelineEvent {
  type: string;
  timestamp: number;
  realTimestamp?: number;
  participantId?: number;
  killerId?: number;
  victimId?: number;
  assistingParticipantIds?: number[];
  position?: {
    x: number;
    y: number;
  };
  buildingType?: string;
  towerType?: string;
  laneType?: string;
  monsterType?: string;
  monsterSubType?: string;
  itemId?: number;
  skillSlot?: number;
  wardType?: string;
  [key: string]: any;
}

export interface TimelineResponse {
  metadata: MatchMetadata;
  info: TimelineInfo;
}

// ============================================
// EventBridge Event Types
// ============================================

export interface MatchIngestedEvent {
  matchId: string;  // UUID
  externalMatchId: string;
  queueId: number;
  participantCount: number;
  timestamp: string;  // ISO 8601
}

// ============================================
// Silver Analytics Types (SILVER layer)
// ============================================

/**
 * Participant analytics data (4-factor model)
 * Maps to match_participant_analytics table
 */
export interface ParticipantAnalyticsData {
  match_participant_id: string;  // UUID - foreign key
  match_id: string;  // UUID
  player_profile_id: string | null;  // UUID or null

  // Economy metrics
  gold_per_minute: number | null;
  cs_per_minute: number | null;
  damage_per_minute: number | null;
  gold_advantage_at_10: number | null;
  gold_advantage_at_15: number | null;
  cs_advantage_at_10: number | null;
  xp_advantage_at_15: number | null;
  early_laning_gold_exp_advantage: number | null;
  bounty_gold: number | null;

  // Objectives/Macro metrics
  objective_participation_rate: number | null;
  takedowns_after_level_advantage: number | null;
  baron_participation: number | null;
  dragon_participation: number | null;
  tower_participation: number | null;
  first_turret_contribution: boolean | null;
  macro_score: number | null;

  // Map control/Vision metrics
  vision_score_per_minute: number | null;
  control_ward_uptime_percent: number | null;
  stealth_wards_placed: number | null;
  wards_cleared: number | null;
  vision_advantage_vs_opponent: number | null;
  roam_efficiency_score: number | null;

  // Error rate metrics
  deaths_per_minute: number | null;
  unforced_death_rate: number | null;
  kill_participation: number | null;
  survival_time_percent: number | null;
  tempo_loss_on_death_avg: number | null;
  wave_management_score: number | null;

  // Composite scores (0-100 normalized)
  economy_score: number | null;
  objectives_score: number | null;
  map_control_score: number | null;
  error_rate_score: number | null;
  overall_performance_score: number | null;
}

/**
 * Timeline analytics data (match-level tempo/objectives)
 * Maps to match_timeline_analytics table
 */
export interface TimelineAnalyticsData {
  match_id: string;  // UUID

  // First blood
  first_blood_timestamp_ms: number | null;
  first_blood_team_id: number | null;
  first_blood_killer_participant_id: number | null;

  // First tower
  first_tower_timestamp_ms: number | null;
  first_tower_team_id: number | null;

  // First dragon
  first_dragon_timestamp_ms: number | null;
  first_dragon_team_id: number | null;

  // First baron
  first_baron_timestamp_ms: number | null;
  first_baron_team_id: number | null;

  // Objective contest quality
  avg_players_near_dragon_kills: number | null;
  avg_players_near_baron_kills: number | null;
  objective_steals_count: number | null;

  // Tempo shifts (JSONB in DB)
  gold_swing_events: Array<{
    timestamp: number;
    team_id: number;
    gold_delta: number;
    reason: string;
  }> | null;
  ace_timestamps: number[] | null;
}

/**
 * Rolling analytics data (aggregated across N matches)
 * Maps to player_rolling_analytics table
 */
export interface RollingAnalyticsData {
  player_profile_id: string;  // UUID

  // Window configuration
  match_count: number;
  champion_id: number | null;
  queue_id: number | null;
  team_position: string | null;

  // Averaged 4 factors
  avg_economy_score: number | null;
  avg_objectives_score: number | null;
  avg_map_control_score: number | null;
  avg_error_rate_score: number | null;
  avg_overall_performance: number | null;

  // Win rate
  win_rate: number | null;
  total_matches: number;

  // Trends
  economy_trend: 'improving' | 'declining' | 'stable' | null;
  objectives_trend: 'improving' | 'declining' | 'stable' | null;
  map_control_trend: 'improving' | 'declining' | 'stable' | null;
  error_rate_trend: 'improving' | 'declining' | 'stable' | null;

  // Match IDs in this aggregate (array of UUIDs)
  match_ids: string[] | null;
}

// ============================================
// API Response Types
// ============================================

export interface PlayerMatchSummary {
  matchId: string;
  externalMatchId: string;
  queueId: number;
  startedAt: string;  // ISO 8601
  duration: number;  // seconds
  win: boolean;
  championName: string;
  championId: number;
  teamPosition: string | null;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  cs: number;
  visionScore: number;
  analytics?: {
    economyScore: number | null;
    objectivesScore: number | null;
    mapControlScore: number | null;
    errorRateScore: number | null;
    overallScore: number | null;
    computed: boolean;
  } | null;
}

export interface PlayerMatchesResponse {
  success: boolean;
  puuid: string;
  gameName?: string;
  tagLine?: string;
  matches: PlayerMatchSummary[];
  totalMatches: number;
  error?: string;
}