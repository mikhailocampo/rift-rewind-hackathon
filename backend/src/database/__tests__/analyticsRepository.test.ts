/**
 * TDD tests for analyticsRepository
 *
 * IMPORTANT: These tests validate SQL type safety to prevent type mismatch errors
 * Tests include:
 * - UUID type casting (::uuid)
 * - JSONB type casting (::jsonb)
 * - Array type casting (::int[], ::bigint[])
 * - NULL handling
 * - Batch operations
 *
 * This prevents runtime errors like "column type UUID does not match TEXT"
 */

import { AnalyticsRepository } from '../analyticsRepository';
import { RDSDataService } from 'aws-sdk';
import {
  ParticipantAnalyticsData,
  TimelineAnalyticsData,
  RollingAnalyticsData
} from '../../types';

// Mock AWS SDK
jest.mock('aws-sdk');

describe('AnalyticsRepository', () => {
  let repository: AnalyticsRepository;
  let mockExecuteStatement: jest.Mock;
  let mockRdsClient: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock RDSDataService
    mockExecuteStatement = jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        records: [[{ stringValue: 'test-uuid-123' }]]
      })
    });

    (RDSDataService as jest.MockedClass<typeof RDSDataService>).mockImplementation(() => ({
      executeStatement: mockExecuteStatement
    } as any));

    // Mock environment variables
    process.env.RDS_CLUSTER_ARN = 'arn:aws:rds:us-west-1:123456789012:cluster:test';
    process.env.RDS_SECRET_ARN = 'arn:aws:secretsmanager:us-west-1:123456789012:secret:test';
    process.env.DATABASE_NAME = 'postgres';

    repository = new AnalyticsRepository();
  });

  describe('SQL Type Safety Tests', () => {
    describe('upsertParticipantAnalytics', () => {
      it('should cast UUID types correctly in SQL statement', async () => {
        const analyticsData: ParticipantAnalyticsData = {
          match_participant_id: 'uuid-participant-123',
          match_id: 'uuid-match-456',
          player_profile_id: 'uuid-player-789',
          gold_per_minute: 445.07,
          cs_per_minute: 8.1,
          damage_per_minute: 983.35,
          gold_advantage_at_10: 500,
          gold_advantage_at_15: 1200,
          cs_advantage_at_10: 10,
          xp_advantage_at_15: 200,
          early_laning_gold_exp_advantage: 1.5,
          bounty_gold: 150,
          objective_participation_rate: 75.0,
          takedowns_after_level_advantage: 5,
          baron_participation: 1,
          dragon_participation: 2,
          tower_participation: 3,
          first_turret_contribution: true,
          macro_score: 82.5,
          vision_score_per_minute: 1.2,
          control_ward_uptime_percent: 45.0,
          stealth_wards_placed: 15,
          wards_cleared: 8,
          vision_advantage_vs_opponent: 5.0,
          roam_efficiency_score: 3.5,
          deaths_per_minute: 0.17,
          unforced_death_rate: 25.0,
          kill_participation: 80.0,
          survival_time_percent: 95.0,
          tempo_loss_on_death_avg: 300,
          wave_management_score: 78.0,
          economy_score: 78.5,
          objectives_score: 82.1,
          map_control_score: 65.3,
          error_rate_score: 88.7,
          overall_performance_score: 78.7
        };

        await repository.upsertParticipantAnalytics(analyticsData);

        // Verify executeStatement was called
        expect(mockExecuteStatement).toHaveBeenCalled();

        const callArgs = mockExecuteStatement.mock.calls[0][0];
        const sql = callArgs.sql;

        // CRITICAL: Verify UUID type casts are present
        expect(sql).toContain('::uuid');
        expect(sql).toMatch(/:match_participant_id::uuid/);
        expect(sql).toMatch(/:match_id::uuid/);
        expect(sql).toMatch(/:player_profile_id::uuid/);

        // Verify SQL uses ON CONFLICT for idempotency
        expect(sql).toContain('ON CONFLICT');
        expect(sql).toContain('match_participant_id');

        // Verify parameters include correct values
        const params = callArgs.parameters;
        expect(params).toContainEqual({
          name: 'match_participant_id',
          value: { stringValue: 'uuid-participant-123' }
        });
        expect(params).toContainEqual({
          name: 'match_id',
          value: { stringValue: 'uuid-match-456' }
        });
      });

      it('should handle NULL values correctly for optional analytics fields', async () => {
        const analyticsData: ParticipantAnalyticsData = {
          match_participant_id: 'uuid-participant-123',
          match_id: 'uuid-match-456',
          player_profile_id: null,  // NULL player profile
          gold_per_minute: 445.07,
          cs_per_minute: 8.1,
          damage_per_minute: null,  // NULL damage
          gold_advantage_at_10: null,
          gold_advantage_at_15: null,
          cs_advantage_at_10: null,
          xp_advantage_at_15: null,
          early_laning_gold_exp_advantage: null,
          bounty_gold: null,
          objective_participation_rate: null,
          takedowns_after_level_advantage: null,
          baron_participation: null,
          dragon_participation: null,
          tower_participation: null,
          first_turret_contribution: null,
          macro_score: null,
          vision_score_per_minute: null,
          control_ward_uptime_percent: null,
          stealth_wards_placed: null,
          wards_cleared: null,
          vision_advantage_vs_opponent: null,
          roam_efficiency_score: null,
          deaths_per_minute: null,
          unforced_death_rate: null,
          kill_participation: null,
          survival_time_percent: null,
          tempo_loss_on_death_avg: null,
          wave_management_score: null,
          economy_score: 78.5,
          objectives_score: null,
          map_control_score: null,
          error_rate_score: null,
          overall_performance_score: 78.5
        };

        await repository.upsertParticipantAnalytics(analyticsData);

        expect(mockExecuteStatement).toHaveBeenCalled();

        const params = mockExecuteStatement.mock.calls[0][0].parameters;

        // Verify NULL is handled correctly
        const playerProfileParam = params.find((p: any) => p.name === 'player_profile_id');
        expect(playerProfileParam.value.isNull).toBe(true);
      });
    });

    describe('upsertTimelineAnalytics', () => {
      it('should cast UUID and JSONB types correctly in SQL statement', async () => {
        const timelineData: TimelineAnalyticsData = {
          match_id: 'uuid-match-456',
          first_blood_timestamp_ms: 125000,
          first_blood_team_id: 100,
          first_blood_killer_participant_id: 3,
          first_tower_timestamp_ms: 420000,
          first_tower_team_id: 100,
          first_dragon_timestamp_ms: 360000,
          first_dragon_team_id: 200,
          first_baron_timestamp_ms: 1200000,
          first_baron_team_id: 100,
          avg_players_near_dragon_kills: 3.5,
          avg_players_near_baron_kills: 4.2,
          objective_steals_count: 1,
          gold_swing_events: [
            { timestamp: 600000, team_id: 100, gold_delta: 2500, reason: 'Baron kill' },
            { timestamp: 900000, team_id: 200, gold_delta: -1500, reason: 'Team wipe' }
          ],
          ace_timestamps: [600000, 1200000]
        };

        await repository.upsertTimelineAnalytics(timelineData);

        expect(mockExecuteStatement).toHaveBeenCalled();

        const callArgs = mockExecuteStatement.mock.calls[0][0];
        const sql = callArgs.sql;

        // CRITICAL: Verify UUID type cast
        expect(sql).toContain('::uuid');
        expect(sql).toMatch(/:match_id::uuid/);

        // CRITICAL: Verify JSONB type casts for arrays/objects
        expect(sql).toContain('::jsonb');
        expect(sql).toMatch(/:gold_swing_events::jsonb/);

        // Verify BIGINT array type cast
        expect(sql).toContain('::bigint[]');
        expect(sql).toMatch(/:ace_timestamps::bigint\[\]/);

        // Verify parameters
        const params = callArgs.parameters;
        expect(params).toContainEqual({
          name: 'match_id',
          value: { stringValue: 'uuid-match-456' }
        });

        // Verify JSONB is stringified
        const goldSwingParam = params.find((p: any) => p.name === 'gold_swing_events');
        expect(goldSwingParam.value.stringValue).toBe(JSON.stringify(timelineData.gold_swing_events));
      });

      it('should handle NULL arrays and objects correctly', async () => {
        const timelineData: TimelineAnalyticsData = {
          match_id: 'uuid-match-456',
          first_blood_timestamp_ms: null,
          first_blood_team_id: null,
          first_blood_killer_participant_id: null,
          first_tower_timestamp_ms: null,
          first_tower_team_id: null,
          first_dragon_timestamp_ms: null,
          first_dragon_team_id: null,
          first_baron_timestamp_ms: null,
          first_baron_team_id: null,
          avg_players_near_dragon_kills: null,
          avg_players_near_baron_kills: null,
          objective_steals_count: null,
          gold_swing_events: null,
          ace_timestamps: null
        };

        await repository.upsertTimelineAnalytics(timelineData);

        expect(mockExecuteStatement).toHaveBeenCalled();

        const params = mockExecuteStatement.mock.calls[0][0].parameters;

        // Verify NULL handling for JSONB
        const goldSwingParam = params.find((p: any) => p.name === 'gold_swing_events');
        expect(goldSwingParam.value.isNull).toBe(true);

        const aceParam = params.find((p: any) => p.name === 'ace_timestamps');
        expect(aceParam.value.isNull).toBe(true);
      });
    });

    describe('upsertRollingAnalytics', () => {
      it('should cast UUID and UUID array types correctly', async () => {
        const rollingData: RollingAnalyticsData = {
          player_profile_id: 'uuid-player-789',
          match_count: 20,
          champion_id: 36,
          queue_id: 420,
          team_position: 'TOP',
          avg_economy_score: 78.5,
          avg_objectives_score: 82.1,
          avg_map_control_score: 65.3,
          avg_error_rate_score: 88.7,
          avg_overall_performance: 78.7,
          win_rate: 55.0,
          total_matches: 20,
          economy_trend: 'improving',
          objectives_trend: 'stable',
          map_control_trend: 'improving',
          error_rate_trend: 'declining',
          match_ids: ['uuid-1', 'uuid-2', 'uuid-3']
        };

        await repository.upsertRollingAnalytics(rollingData);

        expect(mockExecuteStatement).toHaveBeenCalled();

        const callArgs = mockExecuteStatement.mock.calls[0][0];
        const sql = callArgs.sql;

        // CRITICAL: Verify UUID type cast
        expect(sql).toMatch(/:player_profile_id::uuid/);

        // CRITICAL: Verify UUID array type cast
        expect(sql).toContain('::uuid[]');
        expect(sql).toMatch(/:match_ids::uuid\[\]/);

        // Verify parameters
        const params = callArgs.parameters;
        const matchIdsParam = params.find((p: any) => p.name === 'match_ids');
        // UUID arrays should be passed as PostgreSQL array literal
        expect(matchIdsParam.value.stringValue).toBe('{uuid-1,uuid-2,uuid-3}');
      });

      it('should handle COALESCE for optional filter fields', async () => {
        const rollingData: RollingAnalyticsData = {
          player_profile_id: 'uuid-player-789',
          match_count: 20,
          champion_id: null,  // All champions
          queue_id: null,     // All queues
          team_position: null, // All positions
          avg_economy_score: 78.5,
          avg_objectives_score: 82.1,
          avg_map_control_score: 65.3,
          avg_error_rate_score: 88.7,
          avg_overall_performance: 78.7,
          win_rate: 55.0,
          total_matches: 20,
          economy_trend: 'improving',
          objectives_trend: 'stable',
          map_control_trend: 'improving',
          error_rate_trend: 'declining',
          match_ids: ['uuid-1']
        };

        await repository.upsertRollingAnalytics(rollingData);

        expect(mockExecuteStatement).toHaveBeenCalled();

        const callArgs = mockExecuteStatement.mock.calls[0][0];
        const sql = callArgs.sql;

        // Verify UNIQUE constraint uses COALESCE for nullable fields
        // This matches the schema: idx_rolling_analytics_unique
        expect(sql).toContain('COALESCE');
      });
    });
  });

  describe('Database Schema Validation', () => {
    it('should match participant_analytics column names from schema', async () => {
      const analyticsData: ParticipantAnalyticsData = {
        match_participant_id: 'uuid-1',
        match_id: 'uuid-2',
        player_profile_id: 'uuid-3',
        gold_per_minute: 445.07,
        cs_per_minute: 8.1,
        damage_per_minute: 983.35,
        gold_advantage_at_10: 500,
        gold_advantage_at_15: 1200,
        cs_advantage_at_10: 10,
        xp_advantage_at_15: 200,
        early_laning_gold_exp_advantage: 1.5,
        bounty_gold: 150,
        objective_participation_rate: 75.0,
        takedowns_after_level_advantage: 5,
        baron_participation: 1,
        dragon_participation: 2,
        tower_participation: 3,
        first_turret_contribution: true,
        macro_score: 82.5,
        vision_score_per_minute: 1.2,
        control_ward_uptime_percent: 45.0,
        stealth_wards_placed: 15,
        wards_cleared: 8,
        vision_advantage_vs_opponent: 5.0,
        roam_efficiency_score: 3.5,
        deaths_per_minute: 0.17,
        unforced_death_rate: 25.0,
        kill_participation: 80.0,
        survival_time_percent: 95.0,
        tempo_loss_on_death_avg: 300,
        wave_management_score: 78.0,
        economy_score: 78.5,
        objectives_score: 82.1,
        map_control_score: 65.3,
        error_rate_score: 88.7,
        overall_performance_score: 78.7
      };

      await repository.upsertParticipantAnalytics(analyticsData);

      const sql = mockExecuteStatement.mock.calls[0][0].sql;

      // Verify all expected column names from 002_silver_schema.sql
      const expectedColumns = [
        'match_participant_id',
        'match_id',
        'player_profile_id',
        'gold_per_minute',
        'cs_per_minute',
        'damage_per_minute',
        'economy_score',
        'objectives_score',
        'map_control_score',
        'error_rate_score',
        'overall_performance_score'
      ];

      expectedColumns.forEach(column => {
        expect(sql).toContain(column);
      });
    });

    it('should use DECIMAL types for precision metrics', async () => {
      // Verify that decimal values are passed as numbers (not strings)
      // RDS Data API will handle the conversion to DECIMAL(10,2)
      const analyticsData: ParticipantAnalyticsData = {
        match_participant_id: 'uuid-1',
        match_id: 'uuid-2',
        player_profile_id: null,
        gold_per_minute: 445.07,  // DECIMAL(10,2)
        cs_per_minute: 8.1,       // DECIMAL(10,2)
        damage_per_minute: 983.35,
        gold_advantage_at_10: null,
        gold_advantage_at_15: null,
        cs_advantage_at_10: null,
        xp_advantage_at_15: null,
        early_laning_gold_exp_advantage: 1.5,  // DECIMAL(10,2)
        bounty_gold: null,
        objective_participation_rate: null,
        takedowns_after_level_advantage: null,
        baron_participation: null,
        dragon_participation: null,
        tower_participation: null,
        first_turret_contribution: null,
        macro_score: null,
        vision_score_per_minute: null,
        control_ward_uptime_percent: null,
        stealth_wards_placed: null,
        wards_cleared: null,
        vision_advantage_vs_opponent: null,
        roam_efficiency_score: null,
        deaths_per_minute: null,
        unforced_death_rate: null,
        kill_participation: null,
        survival_time_percent: null,
        tempo_loss_on_death_avg: null,
        wave_management_score: null,
        economy_score: 78.5,  // DECIMAL(5,2)
        objectives_score: null,
        map_control_score: null,
        error_rate_score: null,
        overall_performance_score: null
      };

      await repository.upsertParticipantAnalytics(analyticsData);

      const params = mockExecuteStatement.mock.calls[0][0].parameters;

      // Verify decimal values are passed as doubleValue
      const goldPerMinParam = params.find((p: any) => p.name === 'gold_per_minute');
      expect(goldPerMinParam.value.doubleValue).toBe(445.07);
    });
  });

  describe('Error Handling', () => {
    it('should throw error if RDS call fails', async () => {
      mockExecuteStatement.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('RDS connection failed'))
      });

      const analyticsData: ParticipantAnalyticsData = {
        match_participant_id: 'uuid-1',
        match_id: 'uuid-2',
        player_profile_id: null,
        gold_per_minute: null,
        cs_per_minute: null,
        damage_per_minute: null,
        gold_advantage_at_10: null,
        gold_advantage_at_15: null,
        cs_advantage_at_10: null,
        xp_advantage_at_15: null,
        early_laning_gold_exp_advantage: null,
        bounty_gold: null,
        objective_participation_rate: null,
        takedowns_after_level_advantage: null,
        baron_participation: null,
        dragon_participation: null,
        tower_participation: null,
        first_turret_contribution: null,
        macro_score: null,
        vision_score_per_minute: null,
        control_ward_uptime_percent: null,
        stealth_wards_placed: null,
        wards_cleared: null,
        vision_advantage_vs_opponent: null,
        roam_efficiency_score: null,
        deaths_per_minute: null,
        unforced_death_rate: null,
        kill_participation: null,
        survival_time_percent: null,
        tempo_loss_on_death_avg: null,
        wave_management_score: null,
        economy_score: 78.5,
        objectives_score: null,
        map_control_score: null,
        error_rate_score: null,
        overall_performance_score: null
      };

      await expect(repository.upsertParticipantAnalytics(analyticsData))
        .rejects.toThrow('RDS connection failed');
    });
  });
});
