import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { RiotAccountResponse, RiotRegion } from '../types';
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
}