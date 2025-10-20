import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { RiotAccountResponse, RiotRegion, MatchResponse, TimelineResponse } from '../types';
import { SecretsManager } from '../utils/secrets';
import { ExponentialBackoff } from '../utils/backoff';

export class RiotApiClient {
  private axiosInstance: AxiosInstance;
  private apiKey: string | null = null;

  constructor(private region: RiotRegion = RiotRegion.AMERICAS) {
    this.axiosInstance = axios.create({
      baseURL: `https://${region}.api.riotgames.com`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  private async getApiKey(): Promise<string> {
    if (!this.apiKey) {
      this.apiKey = await SecretsManager.getRiotApiKey();
    }
    return this.apiKey;
  }

  private async makeApiCall<T>(endpoint: string): Promise<T> {
    const apiKey = await this.getApiKey();
    
    return ExponentialBackoff.executeWithBackoff(async () => {
      const response: AxiosResponse<T> = await this.axiosInstance.get(endpoint, {
        headers: {
          'X-Riot-Token': apiKey
        }
      });
      return response.data;
    });
  }

  async getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccountResponse> {
    if (!gameName || !tagLine) {
      throw new Error('Both gameName and tagLine are required');
    }

    const endpoint = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

    try {
      const accountData = await this.makeApiCall<RiotAccountResponse>(endpoint);
      return accountData;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Riot ID not found: ${gameName}#${tagLine}`);
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error(`Failed to fetch account data: ${error.message}`);
    }
  }

  /**
   * Get list of match IDs for a player by PUUID
   * @param puuid - Player PUUID
   * @param start - Starting index (default 0)
   * @param count - Number of matches to return (default 20, max 100)
   * @returns Array of match IDs (format: REGION_GAMEID, e.g., "NA1_5391659560")
   */
  async getMatchIdsByPUUID(
    puuid: string,
    start: number = 0,
    count: number = 20
  ): Promise<string[]> {
    if (!puuid) {
      throw new Error('PUUID is required');
    }

    if (count > 100) {
      throw new Error('Count cannot exceed 100');
    }

    const endpoint = `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=${start}&count=${count}`;

    try {
      const matchIds = await this.makeApiCall<string[]>(endpoint);
      return matchIds;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`PUUID not found: ${puuid}`);
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error(`Failed to fetch match IDs: ${error.message}`);
    }
  }

  /**
   * Get match details by match ID
   * @param matchId - Match ID (format: REGION_GAMEID, e.g., "NA1_5391659560")
   * @returns Match data including participants, teams, and metadata
   */
  async getMatch(matchId: string): Promise<MatchResponse> {
    if (!matchId) {
      throw new Error('Match ID is required');
    }

    const endpoint = `/lol/match/v5/matches/${encodeURIComponent(matchId)}`;

    try {
      const matchData = await this.makeApiCall<MatchResponse>(endpoint);
      return matchData;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Match not found: ${matchId}`);
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error(`Failed to fetch match data: ${error.message}`);
    }
  }

  /**
   * Get match timeline by match ID
   * @param matchId - Match ID (format: REGION_GAMEID, e.g., "NA1_5391659560")
   * @returns Timeline data with minute-by-minute frames and events
   */
  async getTimeline(matchId: string): Promise<TimelineResponse> {
    if (!matchId) {
      throw new Error('Match ID is required');
    }

    const endpoint = `/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`;

    try {
      const timelineData = await this.makeApiCall<TimelineResponse>(endpoint);
      return timelineData;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Timeline not found for match: ${matchId}`);
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error(`Failed to fetch timeline data: ${error.message}`);
    }
  }
}