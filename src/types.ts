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