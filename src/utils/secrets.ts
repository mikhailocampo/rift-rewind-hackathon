import AWS from 'aws-sdk';
import { SecretsConfig } from '../types';

const secretsManager = new AWS.SecretsManager({
  region: 'us-west-1'
});

export class SecretsManager {
  private static riotApiKeyCache: string | null = null;

  static async getRiotApiKey(): Promise<string> {
    if (this.riotApiKeyCache) {
      return this.riotApiKeyCache;
    }

    try {
      const result = await secretsManager.getSecretValue({
        SecretId: process.env.RIOT_API_SECRET_ARN!
      }).promise();

      if (!result.SecretString) {
        throw new Error('No secret string found in Riot API secret');
      }

      const secrets: SecretsConfig = JSON.parse(result.SecretString);
      this.riotApiKeyCache = secrets.riot_api_key;
      return this.riotApiKeyCache;
    } catch (error) {
      console.error('Failed to retrieve Riot API key:', error);
      throw new Error('Unable to retrieve Riot API key from AWS Secrets Manager');
    }
  }

  static clearCache(): void {
    this.riotApiKeyCache = null;
  }
}