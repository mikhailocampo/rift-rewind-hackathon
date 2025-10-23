import AWS from 'aws-sdk';
import { ProfileData } from '../types';

/**
 * RdsDataClient - Wrapper for AWS RDS Data API operations
 * Provides batch insert utilities for efficient bulk data loading
 */
export class RdsDataClient {
  private rdsData: AWS.RDSDataService;
  private resourceArn: string;
  private secretArn: string;
  private database: string;

  constructor() {
    this.rdsData = new AWS.RDSDataService({
      region: 'us-west-1'
    });
    this.resourceArn = process.env.RDS_CLUSTER_ARN!;
    this.secretArn = process.env.RDS_SECRET_ARN!;
    this.database = process.env.DATABASE_NAME || 'postgres';
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
        resourceArn: this.resourceArn,
        secretArn: this.secretArn,
        database: this.database,
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
        resourceArn: this.resourceArn,
        secretArn: this.secretArn,
        database: this.database,
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

  /**
   * Execute a SQL statement with the configured RDS Data API connection
   */
  async executeStatement(sql: string, parameters: AWS.RDSDataService.SqlParametersList = []): Promise<AWS.RDSDataService.ExecuteStatementResponse> {
    return this.rdsData.executeStatement({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql,
      parameters
    }).promise();
  }

  /**
   * Build a batch INSERT statement with multiple rows
   * Returns the SQL string and flattened parameters array
   * 
   * Example output:
   * INSERT INTO table (col1, col2) VALUES (:row0_col1, :row0_col2), (:row1_col1, :row1_col2)
   */
  buildBatchInsertSQL(
    tableName: string,
    columns: string[],
    rowCount: number
  ): string {
    const valueClauses: string[] = [];
    
    for (let i = 0; i < rowCount; i++) {
      const paramNames = columns.map(col => `:row${i}_${col}`);
      valueClauses.push(`(${paramNames.join(', ')})`);
    }

    return `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${valueClauses.join(', ')}
    `;
  }

  /**
   * Convert row data into RDS Data API parameter format
   * Each row is an object with column names as keys
   */
  buildBatchParameters(
    columns: string[],
    rows: Record<string, any>[],
    typeMappers: Record<string, (value: any) => AWS.RDSDataService.Field>
  ): AWS.RDSDataService.SqlParametersList {
    const parameters: AWS.RDSDataService.SqlParametersList = [];

    rows.forEach((row, rowIndex) => {
      columns.forEach(column => {
        const value = row[column];
        const mapper = typeMappers[column];
        
        if (!mapper) {
          throw new Error(`No type mapper defined for column: ${column}`);
        }

        parameters.push({
          name: `row${rowIndex}_${column}`,
          value: mapper(value)
        });
      });
    });

    return parameters;
  }

  /**
   * Execute a batch insert operation
   * Automatically chunks data into batches to avoid parameter limits
   */
  async executeBatchInsert(
    tableName: string,
    columns: string[],
    rows: Record<string, any>[],
    typeMappers: Record<string, (value: any) => AWS.RDSDataService.Field>,
    batchSize: number = 50
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    // Process in batches
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      const sql = this.buildBatchInsertSQL(tableName, columns, batch.length);
      const parameters = this.buildBatchParameters(columns, batch, typeMappers);

      await this.executeStatement(sql, parameters);
    }
  }

  /**
   * Common type mappers for RDS Data API
   */
  static typeMappers = {
    string: (value: any): AWS.RDSDataService.Field => 
      value != null ? { stringValue: String(value) } : { isNull: true },
    
    number: (value: any): AWS.RDSDataService.Field => 
      value != null ? { longValue: Number(value) } : { isNull: true },
    
    boolean: (value: any): AWS.RDSDataService.Field => 
      value != null ? { booleanValue: Boolean(value) } : { isNull: true },
    
    json: (value: any): AWS.RDSDataService.Field => 
      value != null ? { stringValue: JSON.stringify(value) } : { isNull: true },
    
    intArray: (value: any[]): AWS.RDSDataService.Field => 
      value != null ? { stringValue: `{${value.join(',')}}` } : { isNull: true },
    
    uuid: (value: any): AWS.RDSDataService.Field => 
      value != null ? { stringValue: String(value) } : { isNull: true },
    
    timestamp: (value: any): AWS.RDSDataService.Field => 
      value != null ? { stringValue: value instanceof Date ? value.toISOString() : String(value) } : { isNull: true }
  };
}