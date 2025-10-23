/**
 * Schema Validation Utility
 * 
 * Provides runtime validation of data types against expected PostgreSQL schema.
 * Helps catch type mismatches before they cause database errors.
 */

export interface ColumnDefinition {
  type: 'string' | 'number' | 'boolean' | 'Date' | 'jsonb' | 'array';
  nullable?: boolean;
  arrayType?: 'number' | 'string'; // For PostgreSQL arrays like INT[] or TEXT[]
}

export interface TableSchema {
  [columnName: string]: ColumnDefinition;
}

/**
 * Database schema definitions
 * This should be kept in sync with your actual PostgreSQL schema
 */
export const DATABASE_SCHEMA: { [tableName: string]: TableSchema } = {
  match: {
    external_match_id: { type: 'string' },
    game: { type: 'string' },
    platform_id: { type: 'string', nullable: true },
    game_mode: { type: 'string', nullable: true },
    queue_id: { type: 'number', nullable: true },
    map_id: { type: 'number', nullable: true },
    game_version: { type: 'string', nullable: true },
    duration_seconds: { type: 'number', nullable: true },
    started_at: { type: 'Date', nullable: true },
    ended_at: { type: 'Date', nullable: true },
    winning_team_id: { type: 'number', nullable: true },
    payload: { type: 'jsonb' }
  },
  
  match_participant: {
    match_id: { type: 'string' },
    participant_id: { type: 'number' },
    puuid: { type: 'string' },
    team_id: { type: 'number' },
    champion_id: { type: 'number' },
    champion_name: { type: 'string' },
    team_position: { type: 'string', nullable: true },
    individual_position: { type: 'string', nullable: true },
    summoner_spells: { type: 'array', arrayType: 'number' },
    items: { type: 'array', arrayType: 'number' },
    kills: { type: 'number' },
    deaths: { type: 'number' },
    assists: { type: 'number' },
    gold_earned: { type: 'number' },
    total_damage_to_champions: { type: 'number' },
    cs_total: { type: 'number' },
    champ_level: { type: 'number' },
    vision_score: { type: 'number' },
    win: { type: 'boolean' },
    primary_rune_style: { type: 'number', nullable: true },
    sub_rune_style: { type: 'number', nullable: true },
    stat_perks: { type: 'jsonb' },
    challenges: { type: 'jsonb' },
    raw_data: { type: 'jsonb' }
  },
  
  match_team: {
    match_id: { type: 'string' },
    team_id: { type: 'number' },
    win: { type: 'boolean' },
    barons: { type: 'number' },
    dragons: { type: 'number' },
    towers: { type: 'number' },
    inhibitors: { type: 'number' },
    rift_heralds: { type: 'number' },
    bans: { type: 'array', arrayType: 'number' },
    raw_data: { type: 'jsonb' }
  },
  
  match_timeline_frame: {
    match_id: { type: 'string' },
    frame_number: { type: 'number' },
    timestamp_ms: { type: 'number' },
    participant_id: { type: 'number' },
    total_gold: { type: 'number' },
    current_gold: { type: 'number' },
    gold_per_second: { type: 'number' },
    xp: { type: 'number' },
    level: { type: 'number' },
    position_x: { type: 'number', nullable: true },
    position_y: { type: 'number', nullable: true },
    champion_stats: { type: 'jsonb' }
  },
  
  match_timeline_event: {
    match_id: { type: 'string' },
    frame_number: { type: 'number' },
    timestamp_ms: { type: 'number' },
    event_type: { type: 'string' },
    participant_id: { type: 'number', nullable: true },
    killer_participant_id: { type: 'number', nullable: true },
    victim_participant_id: { type: 'number', nullable: true },
    assisting_participant_ids: { type: 'array', arrayType: 'number' },
    position_x: { type: 'number', nullable: true },
    position_y: { type: 'number', nullable: true },
    building_type: { type: 'string', nullable: true },
    tower_type: { type: 'string', nullable: true },
    lane_type: { type: 'string', nullable: true },
    monster_type: { type: 'string', nullable: true },
    monster_sub_type: { type: 'string', nullable: true },
    item_id: { type: 'number', nullable: true },
    skill_slot: { type: 'number', nullable: true },
    ward_type: { type: 'string', nullable: true },
    raw_data: { type: 'jsonb' }
  }
};

export class ValidationError extends Error {
  constructor(
    public tableName: string,
    public columnName: string,
    public expectedType: string,
    public actualType: string,
    public value: any
  ) {
    super(
      `Schema validation failed for ${tableName}.${columnName}: ` +
      `expected ${expectedType}, got ${actualType} (value: ${JSON.stringify(value)})`
    );
    this.name = 'ValidationError';
  }
}

export class SchemaValidator {
  /**
   * Validate a single record against a table schema
   * Throws ValidationError if any column has the wrong type
   */
  static validateRecord(tableName: string, record: any): void {
    const schema = DATABASE_SCHEMA[tableName];
    if (!schema) {
      throw new Error(`Unknown table: ${tableName}`);
    }

    for (const [columnName, definition] of Object.entries(schema)) {
      // Skip if column not present in record
      if (!(columnName in record)) {
        continue;
      }

      const value = record[columnName];
      
      // Handle null values
      if (value === null || value === undefined) {
        if (!definition.nullable) {
          throw new ValidationError(
            tableName,
            columnName,
            definition.type,
            'null',
            value
          );
        }
        continue;
      }

      // Validate type
      const isValid = this.validateType(value, definition);
      if (!isValid) {
        const actualType = this.getTypeString(value);
        throw new ValidationError(
          tableName,
          columnName,
          this.getExpectedTypeString(definition),
          actualType,
          value
        );
      }
    }
  }

  /**
   * Validate multiple records (e.g., an array of participants)
   */
  static validateRecords(tableName: string, records: any[]): void {
    records.forEach((record, index) => {
      try {
        this.validateRecord(tableName, record);
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new Error(`Record ${index}: ${error.message}`);
        }
        throw error;
      }
    });
  }

  /**
   * Validate all data for a complete match ingestion
   */
  static validateCompleteMatchData(data: {
    match: any;
    participants: any[];
    teams: any[];
    frames: any[];
    events: any[];
  }): void {
    this.validateRecord('match', data.match);
    this.validateRecords('match_participant', data.participants);
    this.validateRecords('match_team', data.teams);
    this.validateRecords('match_timeline_frame', data.frames);
    this.validateRecords('match_timeline_event', data.events);
  }

  private static validateType(value: any, definition: ColumnDefinition): boolean {
    switch (definition.type) {
      case 'string':
        return typeof value === 'string';
      
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      
      case 'boolean':
        return typeof value === 'boolean';
      
      case 'Date':
        return value instanceof Date && !isNaN(value.getTime());
      
      case 'jsonb':
        // JSONB should be an object (will be stringified later)
        return typeof value === 'object' && value !== null;
      
      case 'array':
        if (!Array.isArray(value)) {
          return false;
        }
        // Validate array element types if specified
        if (definition.arrayType) {
          return value.every(item => typeof item === definition.arrayType);
        }
        return true;
      
      default:
        return false;
    }
  }

  private static getTypeString(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (value instanceof Date) return 'Date';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private static getExpectedTypeString(definition: ColumnDefinition): string {
    if (definition.type === 'array' && definition.arrayType) {
      return `array<${definition.arrayType}>`;
    }
    return definition.type;
  }
}

/**
 * Type guards for RDS Data API parameter types
 * These help ensure you're passing the correct parameter type to AWS RDS Data API
 */
export class RDSDataTypeHelper {
  /**
   * Get the correct RDS Data API parameter value for a given TypeScript value
   */
  static toRDSParameter(value: any, expectedType: ColumnDefinition): any {
    if (value === null || value === undefined) {
      return { isNull: true };
    }

    switch (expectedType.type) {
      case 'string':
        return { stringValue: String(value) };
      
      case 'number':
        return { longValue: Number(value) };
      
      case 'boolean':
        return { booleanValue: Boolean(value) };
      
      case 'Date':
        if (value instanceof Date) {
          return { stringValue: value.toISOString() };
        }
        throw new Error('Expected Date object');
      
      case 'jsonb':
        return { stringValue: JSON.stringify(value) };
      
      case 'array':
        // PostgreSQL arrays as text representation
        if (Array.isArray(value)) {
          return { stringValue: `{${value.join(',')}}` };
        }
        throw new Error('Expected array');
      
      default:
        throw new Error(`Unknown type: ${expectedType.type}`);
    }
  }

  /**
   * Validate that RDS parameter matches expected type
   */
  static validateRDSParameter(
    tableName: string,
    columnName: string,
    value: any,
    rdsParam: any
  ): void {
    const schema = DATABASE_SCHEMA[tableName];
    if (!schema || !schema[columnName]) {
      return; // Unknown column, skip validation
    }

    const definition = schema[columnName];
    
    if (value === null || value === undefined) {
      if (!rdsParam.isNull && !definition.nullable) {
        throw new Error(
          `${tableName}.${columnName} is not nullable but received null`
        );
      }
      return;
    }

    // Check correct RDS parameter type is used
    switch (definition.type) {
      case 'string':
        if (!('stringValue' in rdsParam)) {
          throw new Error(
            `${tableName}.${columnName} should use stringValue in RDS parameter`
          );
        }
        break;
      
      case 'number':
        if (!('longValue' in rdsParam || 'doubleValue' in rdsParam)) {
          throw new Error(
            `${tableName}.${columnName} should use longValue or doubleValue in RDS parameter`
          );
        }
        break;
      
      case 'boolean':
        if (!('booleanValue' in rdsParam)) {
          throw new Error(
            `${tableName}.${columnName} should use booleanValue in RDS parameter`
          );
        }
        break;
    }
  }
}

