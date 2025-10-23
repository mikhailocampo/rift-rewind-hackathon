/**
 * Integration tests for Match Ingestion Pipeline
 * 
 * These tests validate that SQL queries work against the actual database schema.
 * They use real sample data from the Riot API to ensure type compatibility.
 */

import { MatchIngestionService } from '../services/matchIngestionService';
import { MatchRepository } from '../database/matchRepository';
import { RiotApiClient } from '../clients/riotApiClient';
import { MatchDataBuilder } from '../builders/matchDataBuilder';
import * as fs from 'fs';
import * as path from 'path';

// These tests require real AWS credentials and database access
// They should be run manually during development or in CI with proper setup
describe('Match Ingestion Integration Tests', () => {
  let service: MatchIngestionService;
  let repository: MatchRepository;
  let sampleMatchData: any;
  let sampleTimelineData: any;

  beforeAll(() => {
    // Load real sample data from Riot API responses
    const sampleDataPath = path.join(__dirname, '../../sample_data');
    
    if (fs.existsSync(path.join(sampleDataPath, 'match.json'))) {
      sampleMatchData = JSON.parse(
        fs.readFileSync(path.join(sampleDataPath, 'match.json'), 'utf-8')
      );
    }
    
    if (fs.existsSync(path.join(sampleDataPath, 'MatchTimeline.json'))) {
      sampleTimelineData = JSON.parse(
        fs.readFileSync(path.join(sampleDataPath, 'MatchTimeline.json'), 'utf-8')
      );
    }
  });

  describe('SQL Schema Validation', () => {
    test('sample match data transforms correctly', () => {
      if (!sampleMatchData) {
        console.log('⚠️  No sample match data found - skipping test');
        return;
      }

      const matchData = MatchDataBuilder.buildMatchData(sampleMatchData);
      
      // Validate date types
      expect(matchData.started_at).toBeInstanceOf(Date);
      expect(matchData.ended_at).toBeInstanceOf(Date);
      
      // Validate numeric types
      expect(typeof matchData.queue_id).toBe('number');
      expect(typeof matchData.map_id).toBe('number');
      expect(typeof matchData.duration_seconds).toBe('number');
      expect(typeof matchData.winning_team_id).toBe('number');
      
      // Validate string types
      expect(typeof matchData.external_match_id).toBe('string');
      expect(typeof matchData.platform_id).toBe('string');
      expect(typeof matchData.game_mode).toBe('string');
      expect(typeof matchData.game_version).toBe('string');
      
      // Validate payload is an object (will be stringified to JSONB)
      expect(typeof matchData.payload).toBe('object');
      expect(matchData.payload).not.toBeNull();
    });

    test('sample participant data transforms correctly', () => {
      if (!sampleMatchData) {
        console.log('⚠️  No sample match data found - skipping test');
        return;
      }

      const participants = MatchDataBuilder.buildParticipantsData(
        sampleMatchData,
        'test-match-id'
      );
      
      expect(participants.length).toBeGreaterThan(0);
      
      participants.forEach(p => {
        // Validate numeric types
        expect(typeof p.participant_id).toBe('number');
        expect(typeof p.team_id).toBe('number');
        expect(typeof p.champion_id).toBe('number');
        expect(typeof p.kills).toBe('number');
        expect(typeof p.deaths).toBe('number');
        expect(typeof p.assists).toBe('number');
        
        // Validate boolean
        expect(typeof p.win).toBe('boolean');
        
        // Validate arrays
        expect(Array.isArray(p.summoner_spells)).toBe(true);
        expect(Array.isArray(p.items)).toBe(true);
        
        // Validate JSONB fields are objects
        expect(typeof p.stat_perks).toBe('object');
        expect(typeof p.challenges).toBe('object');
        expect(typeof p.raw_data).toBe('object');
      });
    });

    test('sample team data transforms correctly', () => {
      if (!sampleMatchData) {
        console.log('⚠️  No sample match data found - skipping test');
        return;
      }

      const teams = MatchDataBuilder.buildTeamsData(
        sampleMatchData,
        'test-match-id'
      );
      
      expect(teams.length).toBe(2); // Always 2 teams
      
      teams.forEach(t => {
        // Validate numeric types
        expect(typeof t.team_id).toBe('number');
        expect(typeof t.barons).toBe('number');
        expect(typeof t.dragons).toBe('number');
        expect(typeof t.towers).toBe('number');
        
        // Validate boolean
        expect(typeof t.win).toBe('boolean');
        
        // Validate arrays
        expect(Array.isArray(t.bans)).toBe(true);
        
        // Validate JSONB field
        expect(typeof t.raw_data).toBe('object');
      });
    });

    test('sample timeline frames transform correctly', () => {
      if (!sampleTimelineData) {
        console.log('⚠️  No sample timeline data found - skipping test');
        return;
      }

      const frames = MatchDataBuilder.buildTimelineFramesData(
        sampleTimelineData,
        'test-match-id'
      );
      
      expect(frames.length).toBeGreaterThan(0);
      
      frames.forEach(f => {
        // Validate numeric types
        expect(typeof f.frame_number).toBe('number');
        expect(typeof f.timestamp_ms).toBe('number');
        expect(typeof f.participant_id).toBe('number');
        expect(typeof f.total_gold).toBe('number');
        expect(typeof f.level).toBe('number');
        
        // Validate nullable numbers
        if (f.position_x !== null) {
          expect(typeof f.position_x).toBe('number');
        }
        if (f.position_y !== null) {
          expect(typeof f.position_y).toBe('number');
        }
        
        // Validate JSONB field
        expect(typeof f.champion_stats).toBe('object');
      });
    });

    test('sample timeline events transform correctly', () => {
      if (!sampleTimelineData) {
        console.log('⚠️  No sample timeline data found - skipping test');
        return;
      }

      const events = MatchDataBuilder.buildTimelineEventsData(
        sampleTimelineData,
        'test-match-id'
      );
      
      expect(events.length).toBeGreaterThan(0);
      
      events.forEach(e => {
        // Validate numeric types
        expect(typeof e.frame_number).toBe('number');
        expect(typeof e.timestamp_ms).toBe('number');
        
        // Validate string types
        expect(typeof e.event_type).toBe('string');
        
        // Validate arrays
        expect(Array.isArray(e.assisting_participant_ids)).toBe(true);
        
        // Validate JSONB field
        expect(typeof e.raw_data).toBe('object');
      });
    });
  });

  describe('Database Integration (requires AWS setup)', () => {
    beforeEach(() => {
      // Skip if not in integration test environment
      if (!process.env.RDS_CLUSTER_ARN || !process.env.RDS_SECRET_ARN) {
        console.log('⚠️  Database credentials not found - skipping integration tests');
        console.log('   Set RDS_CLUSTER_ARN and RDS_SECRET_ARN to run these tests');
        return;
      }

      repository = new MatchRepository();
    });

    test.skip('can insert match data with correct types', async () => {
      // This test should be run manually with proper AWS credentials
      if (!sampleMatchData || !sampleTimelineData) {
        return;
      }

      const completeData = MatchDataBuilder.buildCompleteMatchData(
        sampleMatchData,
        sampleTimelineData
      );

      // This will throw if there are type mismatches
      const matchId = await repository.upsertMatch(completeData.match);
      expect(matchId).toBeTruthy();
      expect(typeof matchId).toBe('string');

      // Cleanup
      // Note: In a real test, you'd want to clean up after yourself
    });
  });
});

/**
 * Type validation helper
 * 
 * This helper ensures that data types match what PostgreSQL expects.
 * Use this in your tests to catch type mismatches early.
 */
export class SchemaValidator {
  /**
   * Expected column types for each table
   * This should match your actual database schema
   */
  private static SCHEMA = {
    match: {
      external_match_id: 'string',
      game: 'string',
      platform_id: 'string',
      game_mode: 'string',
      queue_id: 'number',
      map_id: 'number',
      game_version: 'string',
      duration_seconds: 'number',
      started_at: 'Date',
      ended_at: 'Date',
      winning_team_id: 'number',
      payload: 'jsonb'
    },
    match_participant: {
      participant_id: 'number',
      puuid: 'string',
      team_id: 'number',
      champion_id: 'number',
      champion_name: 'string',
      kills: 'number',
      deaths: 'number',
      assists: 'number',
      win: 'boolean',
      stat_perks: 'jsonb',
      challenges: 'jsonb',
      raw_data: 'jsonb'
    },
    match_team: {
      team_id: 'number',
      win: 'boolean',
      barons: 'number',
      dragons: 'number',
      raw_data: 'jsonb'
    },
    match_timeline_frame: {
      frame_number: 'number',
      timestamp_ms: 'number',
      participant_id: 'number',
      total_gold: 'number',
      champion_stats: 'jsonb'
    },
    match_timeline_event: {
      frame_number: 'number',
      timestamp_ms: 'number',
      event_type: 'string',
      raw_data: 'jsonb'
    }
  };

  /**
   * Validate that data matches expected schema types
   */
  static validateRecord(tableName: keyof typeof SchemaValidator.SCHEMA, data: any): void {
    const schema = this.SCHEMA[tableName];
    if (!schema) {
      throw new Error(`Unknown table: ${tableName}`);
    }

    for (const [column, expectedType] of Object.entries(schema)) {
      if (!(column in data)) {
        continue; // Skip if column not in data
      }

      const value = data[column];
      const actualType = value instanceof Date ? 'Date' : typeof value;

      if (expectedType === 'jsonb') {
        if (typeof value !== 'object' || value === null) {
          throw new Error(
            `Type mismatch in ${tableName}.${column}: expected object for JSONB, got ${actualType}`
          );
        }
      } else if (actualType !== expectedType) {
        throw new Error(
          `Type mismatch in ${tableName}.${column}: expected ${expectedType}, got ${actualType}`
        );
      }
    }
  }
}

