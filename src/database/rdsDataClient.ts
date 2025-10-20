import AWS from 'aws-sdk';
import { ProfileData } from '../types';

export class RdsDataClient {
  private rdsData: AWS.RDSDataService;

  constructor() {
    this.rdsData = new AWS.RDSDataService({
      region: 'us-west-1'
    });
  }

  async insertOrUpdateProfile(profileData: ProfileData): Promise<void> {
    const sql = `
      INSERT INTO player_profile (puuid, riot_gamename, riot_tagline, platform_id, meta)
      VALUES (:puuid, :riot_gamename, :riot_tagline, :platform_id, :meta::jsonb)
      ON CONFLICT (puuid) 
      DO UPDATE SET 
        riot_gamename = EXCLUDED.riot_gamename,
        riot_tagline = EXCLUDED.riot_tagline,
        platform_id = EXCLUDED.platform_id,
        meta = EXCLUDED.meta
    `;

    const parameters = [
      { name: 'puuid', value: { stringValue: profileData.puuid } },
      { name: 'riot_gamename', value: { stringValue: profileData.riot_gamename } },
      { name: 'riot_tagline', value: { stringValue: profileData.riot_tagline } },
      { name: 'platform_id', value: { stringValue: profileData.platform_id } },
      { name: 'meta', value: { stringValue: JSON.stringify(profileData.meta) } }
    ];

    try {
      const result = await this.rdsData.executeStatement({
        resourceArn: process.env.RDS_CLUSTER_ARN!,
        secretArn: process.env.RDS_SECRET_ARN!,
        database: process.env.DATABASE_NAME!,
        sql,
        parameters
      }).promise();

      console.log('Profile data inserted/updated successfully:', result);
    } catch (error) {
      console.error('Failed to insert/update profile data:', error);
      throw new Error(`Database operation failed: ${error}`);
    }
  }

  async getProfileByPuuid(puuid: string): Promise<ProfileData | null> {
    const sql = `
      SELECT puuid, riot_gamename, riot_tagline, platform_id, meta
      FROM player_profile 
      WHERE puuid = :puuid
    `;

    const parameters = [
      { name: 'puuid', value: { stringValue: puuid } }
    ];

    try {
      const result = await this.rdsData.executeStatement({
        resourceArn: process.env.RDS_CLUSTER_ARN!,
        secretArn: process.env.RDS_SECRET_ARN!,
        database: process.env.DATABASE_NAME!,
        sql,
        parameters
      }).promise();

      if (!result.records || result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      return {
        puuid: record[0].stringValue!,
        riot_gamename: record[1].stringValue!,
        riot_tagline: record[2].stringValue!,
        platform_id: record[3].stringValue!,
        meta: record[4].stringValue ? JSON.parse(record[4].stringValue) : {}
      };
    } catch (error) {
      console.error('Failed to retrieve profile data:', error);
      throw new Error(`Database query failed: ${error}`);
    }
  }
}