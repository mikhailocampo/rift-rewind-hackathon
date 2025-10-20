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