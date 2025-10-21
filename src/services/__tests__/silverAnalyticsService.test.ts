/**
 * TDD tests for silverAnalyticsService
 *
 * Tests the bronze→silver transformation logic:
 * - Economy score calculation
 * - Objectives score calculation
 * - Map control score calculation
 * - Error rate score calculation
 * - Timeline analytics (first blood, objectives)
 * - Rolling analytics (multi-match aggregates)
 *
 * These tests ensure the analytics formulas are correct before implementation
 */

import { SilverAnalyticsService } from '../silverAnalyticsService';
import { AnalyticsRepository } from '../../database/analyticsRepository';
import { RdsDataClient } from '../../database/rdsDataClient';

// Mock dependencies
jest.mock('../../database/analyticsRepository');
jest.mock('../../database/rdsDataClient');

describe('SilverAnalyticsService', () => {
  let service: SilverAnalyticsService;
  let mockAnalyticsRepo: jest.Mocked<AnalyticsRepository>;
  let mockRdsClient: jest.Mocked<RdsDataClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock AnalyticsRepository
    mockAnalyticsRepo = new AnalyticsRepository() as jest.Mocked<AnalyticsRepository>;
    mockAnalyticsRepo.upsertParticipantAnalytics = jest.fn();
    mockAnalyticsRepo.upsertTimelineAnalytics = jest.fn();
    mockAnalyticsRepo.upsertRollingAnalytics = jest.fn();

    // Mock RdsDataClient
    mockRdsClient = new RdsDataClient() as jest.Mocked<RdsDataClient>;

    service = new SilverAnalyticsService();
    (service as any).analyticsRepo = mockAnalyticsRepo;
    (service as any).rdsClient = mockRdsClient;
  });

  describe('computeParticipantAnalytics', () => {
    it('should compute economy metrics from bronze data', async () => {
      const matchId = 'uuid-match-123';

      // Mock SQL query to fetch bronze participant data
      mockRdsClient.executeStatement = jest.fn().mockResolvedValue({
        records: [
          [
            { stringValue: 'uuid-participant-1' }, // id
            { stringValue: matchId }, // match_id
            { stringValue: 'uuid-player-1' }, // player_profile_id
            { longValue: 15653 }, // gold_earned
            { longValue: 285 }, // cs_total
            { longValue: 34585 }, // total_damage_to_champions
            { longValue: 2110 }, // duration_seconds (from match table)
            { stringValue: JSON.stringify({ goldPerMinute: 445.07 }) } // challenges
          ]
        ]
      });

      await service.computeParticipantAnalytics(matchId);

      expect(mockAnalyticsRepo.upsertParticipantAnalytics).toHaveBeenCalled();

      const callArgs = mockAnalyticsRepo.upsertParticipantAnalytics.mock.calls[0][0];

      // Verify economy metrics
      expect(callArgs.gold_per_minute).toBeCloseTo(445.07, 2); // 15653 / (2110 / 60)
      expect(callArgs.cs_per_minute).toBeCloseTo(8.1, 1); // 285 / (2110 / 60)
      expect(callArgs.damage_per_minute).toBeCloseTo(983.35, 2); // 34585 / (2110 / 60)
    });

    it('should compute objectives metrics from timeline events', async () => {
      const matchId = 'uuid-match-123';

      // Mock participant data
      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({
          // First call: get participants
          records: [[
            { stringValue: 'uuid-participant-1' },
            { stringValue: matchId },
            { stringValue: 'uuid-player-1' },
            { longValue: 1 }, // participant_id
            { longValue: 100 }, // team_id
            { longValue: 15653 },
            { longValue: 285 },
            { longValue: 34585 },
            { longValue: 2110 },
            { stringValue: '{}' }
          ]]
        })
        .mockResolvedValueOnce({
          // Second call: get baron kills for this participant
          records: [[{ longValue: 1 }]] // baron_participation count
        })
        .mockResolvedValueOnce({
          // Third call: get dragon kills
          records: [[{ longValue: 2 }]] // dragon_participation count
        })
        .mockResolvedValueOnce({
          // Fourth call: get tower kills
          records: [[{ longValue: 3 }]] // tower_participation count
        })
        .mockResolvedValueOnce({
          // Fifth call: total team objectives
          records: [[{ longValue: 10 }]] // total team objectives
        });

      await service.computeParticipantAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertParticipantAnalytics.mock.calls[0][0];

      // Verify objectives metrics
      expect(callArgs.baron_participation).toBe(1);
      expect(callArgs.dragon_participation).toBe(2);
      expect(callArgs.tower_participation).toBe(3);
      expect(callArgs.objective_participation_rate).toBeCloseTo(60.0, 1); // 6/10 = 60%
    });

    it('should compute map control metrics from challenges data', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn().mockResolvedValue({
        records: [[
          { stringValue: 'uuid-participant-1' },
          { stringValue: matchId },
          { stringValue: 'uuid-player-1' },
          { longValue: 15653 },
          { longValue: 285 },
          { longValue: 34585 },
          { longValue: 2110 },
          { stringValue: JSON.stringify({
            visionScore: 42,
            controlWardTimeCoverageInRiver: 0.45,
            stealthWardsPlaced: 15,
            wardsGuarded: 8,
            visionScoreAdvantageLaneOpponent: 5.0
          })}
        ]]
      });

      await service.computeParticipantAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertParticipantAnalytics.mock.calls[0][0];

      // Verify map control metrics from challenges
      expect(callArgs.vision_score_per_minute).toBeCloseTo(1.2, 1); // 42 / (2110 / 60)
      expect(callArgs.control_ward_uptime_percent).toBe(45.0);
      expect(callArgs.stealth_wards_placed).toBe(15);
      expect(callArgs.wards_cleared).toBe(8);
      expect(callArgs.vision_advantage_vs_opponent).toBe(5.0);
    });

    it('should compute error rate metrics', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn().mockResolvedValue({
        records: [[
          { stringValue: 'uuid-participant-1' },
          { stringValue: matchId },
          { stringValue: 'uuid-player-1' },
          { longValue: 6 }, // deaths
          { longValue: 8 }, // kills
          { longValue: 12 }, // assists
          { longValue: 20 }, // team total kills
          { longValue: 2110 }, // duration_seconds
          { stringValue: '{}' }
        ]]
      });

      await service.computeParticipantAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertParticipantAnalytics.mock.calls[0][0];

      // Verify error metrics
      expect(callArgs.deaths_per_minute).toBeCloseTo(0.17, 2); // 6 / (2110 / 60)
      expect(callArgs.kill_participation).toBeCloseTo(100.0, 1); // (8 + 12) / 20 = 100%
    });

    it('should normalize scores to 0-100 scale', async () => {
      const matchId = 'uuid-match-123';

      // Mock participant with high performance
      mockRdsClient.executeStatement = jest.fn().mockResolvedValue({
        records: [[
          { stringValue: 'uuid-participant-1' },
          { stringValue: matchId },
          { stringValue: 'uuid-player-1' },
          { longValue: 15653 },
          { longValue: 285 },
          { longValue: 34585 },
          { longValue: 2110 },
          { stringValue: JSON.stringify({ goldPerMinute: 445.07 }) }
        ]]
      });

      await service.computeParticipantAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertParticipantAnalytics.mock.calls[0][0];

      // Verify composite scores are in 0-100 range
      if (callArgs.economy_score !== null) {
        expect(callArgs.economy_score).toBeGreaterThanOrEqual(0);
        expect(callArgs.economy_score).toBeLessThanOrEqual(100);
      }

      if (callArgs.overall_performance_score !== null) {
        expect(callArgs.overall_performance_score).toBeGreaterThanOrEqual(0);
        expect(callArgs.overall_performance_score).toBeLessThanOrEqual(100);
      }
    });

    it('should handle missing challenges data gracefully', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn().mockResolvedValue({
        records: [[
          { stringValue: 'uuid-participant-1' },
          { stringValue: matchId },
          { stringValue: 'uuid-player-1' },
          { longValue: 15653 },
          { longValue: 285 },
          { longValue: 34585 },
          { longValue: 2110 },
          { isNull: true } // NULL challenges
        ]]
      });

      await service.computeParticipantAnalytics(matchId);

      // Should not throw error
      expect(mockAnalyticsRepo.upsertParticipantAnalytics).toHaveBeenCalled();

      const callArgs = mockAnalyticsRepo.upsertParticipantAnalytics.mock.calls[0][0];

      // Challenge-derived metrics should be null
      expect(callArgs.early_laning_gold_exp_advantage).toBeNull();
      expect(callArgs.control_ward_uptime_percent).toBeNull();
    });
  });

  describe('computeTimelineAnalytics', () => {
    it('should extract first blood timing and participant from timeline events', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn().mockResolvedValue({
        records: [[
          { longValue: 125000 }, // timestamp_ms
          { longValue: 100 }, // team_id (from killer participant)
          { longValue: 3 } // killer_participant_id
        ]]
      });

      await service.computeTimelineAnalytics(matchId);

      expect(mockAnalyticsRepo.upsertTimelineAnalytics).toHaveBeenCalled();

      const callArgs = mockAnalyticsRepo.upsertTimelineAnalytics.mock.calls[0][0];

      expect(callArgs.first_blood_timestamp_ms).toBe(125000);
      expect(callArgs.first_blood_team_id).toBe(100);
      expect(callArgs.first_blood_killer_participant_id).toBe(3);
    });

    it('should extract first tower timing from BUILDING_KILL events', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({ records: [] }) // No first blood
        .mockResolvedValueOnce({
          // First tower
          records: [[
            { longValue: 420000 },
            { longValue: 100 }
          ]]
        });

      await service.computeTimelineAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertTimelineAnalytics.mock.calls[0][0];

      expect(callArgs.first_tower_timestamp_ms).toBe(420000);
      expect(callArgs.first_tower_team_id).toBe(100);
    });

    it('should extract first dragon from ELITE_MONSTER_KILL events', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({
          // First dragon
          records: [[
            { longValue: 360000 },
            { longValue: 200 }
          ]]
        });

      await service.computeTimelineAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertTimelineAnalytics.mock.calls[0][0];

      expect(callArgs.first_dragon_timestamp_ms).toBe(360000);
      expect(callArgs.first_dragon_team_id).toBe(200);
    });

    it('should extract first baron from ELITE_MONSTER_KILL events', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({
          // First baron
          records: [[
            { longValue: 1200000 },
            { longValue: 100 }
          ]]
        });

      await service.computeTimelineAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertTimelineAnalytics.mock.calls[0][0];

      expect(callArgs.first_baron_timestamp_ms).toBe(1200000);
      expect(callArgs.first_baron_team_id).toBe(100);
    });

    it('should handle matches with no first blood', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn().mockResolvedValue({
        records: [] // No first blood in match
      });

      await service.computeTimelineAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertTimelineAnalytics.mock.calls[0][0];

      expect(callArgs.first_blood_timestamp_ms).toBeNull();
      expect(callArgs.first_blood_team_id).toBeNull();
      expect(callArgs.first_blood_killer_participant_id).toBeNull();
    });
  });

  describe('computeRollingAnalytics', () => {
    it('should compute average scores across last 20 ranked matches', async () => {
      const playerProfileId = 'uuid-player-789';
      const queueId = 420; // Ranked Solo/Duo

      // Mock: Get last 20 match IDs
      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({
          records: Array(20).fill(null).map((_, i) => [
            { stringValue: `uuid-match-${i}` }
          ])
        })
        .mockResolvedValueOnce({
          // Average analytics for these matches
          records: [[
            { doubleValue: 78.5 }, // avg_economy_score
            { doubleValue: 82.1 }, // avg_objectives_score
            { doubleValue: 65.3 }, // avg_map_control_score
            { doubleValue: 88.7 }, // avg_error_rate_score
            { doubleValue: 78.7 }, // avg_overall_performance
            { doubleValue: 55.0 }, // win_rate
            { longValue: 20 } // total_matches
          ]]
        });

      await service.computeRollingAnalytics(playerProfileId, 20, queueId);

      expect(mockAnalyticsRepo.upsertRollingAnalytics).toHaveBeenCalled();

      const callArgs = mockAnalyticsRepo.upsertRollingAnalytics.mock.calls[0][0];

      expect(callArgs.player_profile_id).toBe(playerProfileId);
      expect(callArgs.match_count).toBe(20);
      expect(callArgs.queue_id).toBe(420);
      expect(callArgs.avg_economy_score).toBeCloseTo(78.5, 1);
      expect(callArgs.avg_objectives_score).toBeCloseTo(82.1, 1);
      expect(callArgs.win_rate).toBeCloseTo(55.0, 1);
    });

    it('should compute trend (improving/declining/stable) from first half vs second half', async () => {
      const playerProfileId = 'uuid-player-789';

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({
          records: Array(20).fill(null).map((_, i) => [{ stringValue: `uuid-${i}` }])
        })
        .mockResolvedValueOnce({
          records: [[
            { doubleValue: 78.5 },
            { doubleValue: 82.1 },
            { doubleValue: 65.3 },
            { doubleValue: 88.7 },
            { doubleValue: 78.7 },
            { doubleValue: 55.0 },
            { longValue: 20 }
          ]]
        })
        .mockResolvedValueOnce({
          // First 10 games averages
          records: [[
            { doubleValue: 70.0 }, // economy_score first half
            { doubleValue: 75.0 }, // objectives_score first half
            { doubleValue: 60.0 },
            { doubleValue: 85.0 }
          ]]
        })
        .mockResolvedValueOnce({
          // Last 10 games averages
          records: [[
            { doubleValue: 87.0 }, // economy_score second half (improving!)
            { doubleValue: 89.0 }, // objectives_score second half (improving!)
            { doubleValue: 70.5 }, // improving
            { doubleValue: 92.0 }  // improving
          ]]
        });

      await service.computeRollingAnalytics(playerProfileId, 20);

      const callArgs = mockAnalyticsRepo.upsertRollingAnalytics.mock.calls[0][0];

      // Trend should be 'improving' since second half > first half by > 5 points
      expect(callArgs.economy_trend).toBe('improving');
      expect(callArgs.objectives_trend).toBe('improving');
    });

    it('should support filtering by champion_id', async () => {
      const playerProfileId = 'uuid-player-789';
      const championId = 36; // Dr. Mundo

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({
          records: Array(10).fill(null).map((_, i) => [{ stringValue: `uuid-${i}` }])
        })
        .mockResolvedValueOnce({
          records: [[
            { doubleValue: 85.0 },
            { doubleValue: 90.0 },
            { doubleValue: 70.0 },
            { doubleValue: 88.0 },
            { doubleValue: 83.0 },
            { doubleValue: 60.0 },
            { longValue: 10 }
          ]]
        });

      await service.computeRollingAnalytics(playerProfileId, 20, undefined, championId);

      const callArgs = mockAnalyticsRepo.upsertRollingAnalytics.mock.calls[0][0];

      expect(callArgs.champion_id).toBe(36);
      expect(callArgs.queue_id).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockRdsClient.executeStatement = jest.fn().mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(service.computeParticipantAnalytics('uuid-match-123'))
        .rejects.toThrow('Database connection failed');
    });

    it('should skip analytics if match has no participants', async () => {
      mockRdsClient.executeStatement = jest.fn().mockResolvedValue({
        records: [] // No participants
      });

      await service.computeParticipantAnalytics('uuid-match-123');

      // Should not attempt to upsert
      expect(mockAnalyticsRepo.upsertParticipantAnalytics).not.toHaveBeenCalled();
    });
  });
});
