import { RiotApiClient } from '../clients/riotApiClient';
import { ProfileDataBuilder } from '../builders/profileDataBuilder';
import { RdsDataClient } from '../database/rdsDataClient';
import { RiotProfileRequest, ProfileQueryResult, RiotRegion, RiotPlatform } from '../types';

export class ProfileService {
  private riotClient: RiotApiClient;
  private dbClient: RdsDataClient;

  constructor(region: RiotRegion = RiotRegion.AMERICAS) {
    this.riotClient = new RiotApiClient(region);
    this.dbClient = new RdsDataClient();
  }

  async fetchAndStoreProfile(request: RiotProfileRequest): Promise<ProfileQueryResult> {
    try {
      // Validate input
      this.validateRequest(request);

      console.log(`Fetching profile for ${request.gameName}#${request.tagLine}`);

      // Fetch data from Riot API
      const accountData = await this.riotClient.getAccountByRiotId(
        request.gameName, 
        request.tagLine
      );

      // Transform data using builder pattern
      const profileData = ProfileDataBuilder
        .fromRiotAccount(accountData)
        .withPlatformId(RiotPlatform.NA1)
        .addMetadataField('fetchedAt', new Date().toISOString())
        .addMetadataField('requestSource', 'lambda')
        .build();

      // Store in database
      await this.dbClient.insertOrUpdateProfile(profileData);

      console.log(`Profile successfully stored for PUUID: ${profileData.puuid}`);

      return {
        success: true,
        data: profileData,
        statusCode: 200
      };

    } catch (error: any) {
      console.error('Profile service error:', error);

      if (error.message.includes('Riot ID not found')) {
        return {
          success: false,
          error: error.message,
          statusCode: 404
        };
      }

      if (error.message.includes('Rate limit exceeded')) {
        return {
          success: false,
          error: error.message,
          statusCode: 429
        };
      }

      if (error.message.includes('Required fields missing')) {
        return {
          success: false,
          error: error.message,
          statusCode: 400
        };
      }

      return {
        success: false,
        error: 'Internal server error occurred while processing profile request',
        statusCode: 500
      };
    }
  }

  private validateRequest(request: RiotProfileRequest): void {
    if (!request.gameName || !request.tagLine) {
      throw new Error('Required fields missing: Both gameName and tagLine must be provided');
    }

    if (typeof request.gameName !== 'string' || typeof request.tagLine !== 'string') {
      throw new Error('Invalid field types: gameName and tagLine must be strings');
    }

    if (request.gameName.trim().length === 0 || request.tagLine.trim().length === 0) {
      throw new Error('Invalid field values: gameName and tagLine cannot be empty');
    }

    // Basic format validation
    if (request.gameName.length > 16 || request.tagLine.length > 5) {
      throw new Error('Invalid field lengths: gameName max 16 characters, tagLine max 5 characters');
    }
  }
}