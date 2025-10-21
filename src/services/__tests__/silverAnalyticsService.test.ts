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

      // Mock SQL query to fetch bronze participant data (must match actual query columns - now 17 columns)
      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({
          // OPTIMIZATION: Batch opponents query
          records: [[
            { longValue: 1 }, // participant_id
            { stringValue: 'TOP' }, // individual_position
            { longValue: 100 } // team_id
          ]]
        })
        .mockResolvedValueOnce({
          // OPTIMIZATION: Batch frames 10 query
          records: []
        })
        .mockResolvedValueOnce({
          // OPTIMIZATION: Batch frames 15 query
          records: []
        })
        .mockResolvedValueOnce({
          // Participants query
          records: [[
            { stringValue: 'uuid-participant-1' }, // 0: id
            { stringValue: matchId }, // 1: match_id
            { stringValue: 'uuid-player-1' }, // 2: player_profile_id
            { longValue: 1 }, // 3: in_game_participant_id
            { longValue: 100 }, // 4: team_id
            { longValue: 15653 }, // 5: gold_earned
            { longValue: 285 }, // 6: cs_total
            { longValue: 34585 }, // 7: total_damage_to_champions
            { longValue: 8 }, // 8: kills
            { longValue: 3 }, // 9: deaths
            { longValue: 12 }, // 10: assists
            { longValue: 42 }, // 11: vision_score
            { booleanValue: true }, // 12: win
            { stringValue: JSON.stringify({ goldPerMinute: 445.07 }) }, // 13: challenges
            { longValue: 2110 }, // 14: duration_seconds
            { longValue: 200 }, // 15: winning_team_id
            { stringValue: 'TOP' } // 16: individual_position
          ]]
        })
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Baron participation
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Dragon participation
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Tower participation
        .mockResolvedValueOnce({ records: [] }) // First turret contribution
        .mockResolvedValueOnce({ records: [[{ longValue: 20 }]] }) // Team kills (cached)
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Solo deaths
        .mockResolvedValueOnce({ records: [] }); // Death timestamps

      await service.computeParticipantAnalytics(matchId);

      expect(mockAnalyticsRepo.upsertParticipantAnalytics).toHaveBeenCalled();

      const callArgs = mockAnalyticsRepo.upsertParticipantAnalytics.mock.calls[0][0];

      // Verify economy metrics
      expect(callArgs.gold_per_minute).toBeCloseTo(445.11, 1); // 15653 / (2110 / 60) = 445.11
      expect(callArgs.cs_per_minute).toBeCloseTo(8.1, 1); // 285 / (2110 / 60)
      expect(callArgs.damage_per_minute).toBeCloseTo(983.46, 1); // 34585 / (2110 / 60) = 983.46
    });

    it('should compute objectives metrics from timeline events', async () => {
      const matchId = 'uuid-match-123';

      // Mock participant data (all 17 columns required now)
      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({
          // OPTIMIZATION: Batch opponents query
          records: [[
            { longValue: 1 }, { stringValue: 'TOP' }, { longValue: 100 }
          ]]
        })
        .mockResolvedValueOnce({ records: [] }) // OPTIMIZATION: Batch frames 10
        .mockResolvedValueOnce({ records: [] }) // OPTIMIZATION: Batch frames 15
        .mockResolvedValueOnce({
          // Participants query
          records: [[
            { stringValue: 'uuid-participant-1' }, // 0: id
            { stringValue: matchId }, // 1: match_id
            { stringValue: 'uuid-player-1' }, // 2: player_profile_id
            { longValue: 1 }, // 3: in_game_participant_id
            { longValue: 100 }, // 4: team_id
            { longValue: 15653 }, // 5: gold_earned
            { longValue: 285 }, // 6: cs_total
            { longValue: 34585 }, // 7: total_damage_to_champions
            { longValue: 8 }, // 8: kills
            { longValue: 3 }, // 9: deaths
            { longValue: 12 }, // 10: assists
            { longValue: 42 }, // 11: vision_score
            { booleanValue: true }, // 12: win
            { stringValue: '{}' }, // 13: challenges
            { longValue: 2110 }, // 14: duration_seconds
            { longValue: 200 }, // 15: winning_team_id
            { stringValue: 'TOP' } // 16: individual_position
          ]]
        })
        .mockResolvedValueOnce({ records: [[{ longValue: 1 }]] }) // Baron participation
        .mockResolvedValueOnce({ records: [[{ longValue: 2 }]] }) // Dragon participation
        .mockResolvedValueOnce({ records: [[{ longValue: 3 }]] }) // Tower participation
        .mockResolvedValueOnce({ records: [[{ longValue: 1 }]] }) // First turret (yes)
        .mockResolvedValueOnce({ records: [[{ longValue: 10 }]] }) // Total team objectives
        .mockResolvedValueOnce({ records: [[{ longValue: 20 }]] }) // Team kills
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Solo deaths
        .mockResolvedValueOnce({ records: [] }); // Death timestamps

      await service.computeParticipantAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertParticipantAnalytics.mock.calls[0][0];

      // Verify objectives metrics
      expect(callArgs.baron_participation).toBe(1);
      expect(callArgs.dragon_participation).toBe(2);
      expect(callArgs.tower_participation).toBe(3);
      expect(callArgs.objective_participation_rate).toBeCloseTo(60.0, 1); // 6/10 = 60%
      expect(callArgs.first_turret_contribution).toBe(true);
    });

    it('should compute map control metrics from challenges data', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({
          // OPTIMIZATION: Batch opponents query
          records: [[
            { longValue: 1 }, { stringValue: 'TOP' }, { longValue: 100 }
          ]]
        })
        .mockResolvedValueOnce({ records: [] }) // OPTIMIZATION: Batch frames 10
        .mockResolvedValueOnce({ records: [] }) // OPTIMIZATION: Batch frames 15
        .mockResolvedValueOnce({
          // Participants query
          records: [[
            { stringValue: 'uuid-participant-1' }, // 0: id
            { stringValue: matchId }, // 1: match_id
            { stringValue: 'uuid-player-1' }, // 2: player_profile_id
            { longValue: 1 }, // 3: in_game_participant_id
            { longValue: 100 }, // 4: team_id
            { longValue: 15653 }, // 5: gold_earned
            { longValue: 285 }, // 6: cs_total
            { longValue: 34585 }, // 7: total_damage_to_champions
            { longValue: 8 }, // 8: kills
            { longValue: 3 }, // 9: deaths
            { longValue: 12 }, // 10: assists
            { longValue: 42 }, // 11: vision_score
            { booleanValue: true }, // 12: win
            { stringValue: JSON.stringify({
              visionScore: 42,
              controlWardTimeCoverageInRiver: 0.45,
              stealthWardsPlaced: 15,
              wardsGuarded: 8,
              visionScoreAdvantageLaneOpponent: 5.0
            })}, // 13: challenges
            { longValue: 2110 }, // 14: duration_seconds
            { longValue: 200 }, // 15: winning_team_id
            { stringValue: 'TOP' } // 16: individual_position
          ]]
        })
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Baron
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Dragon
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Tower
        .mockResolvedValueOnce({ records: [] }) // First turret
        .mockResolvedValueOnce({ records: [[{ longValue: 20 }]] }) // Team kills (cached)
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Solo deaths
        .mockResolvedValueOnce({ records: [] }); // Death timestamps

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

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({
          // OPTIMIZATION: Batch opponents query
          records: [[
            { longValue: 1 }, { stringValue: 'TOP' }, { longValue: 100 }
          ]]
        })
        .mockResolvedValueOnce({ records: [] }) // OPTIMIZATION: Batch frames 10
        .mockResolvedValueOnce({ records: [] }) // OPTIMIZATION: Batch frames 15
        .mockResolvedValueOnce({
          // Participants query
          records: [[
            { stringValue: 'uuid-participant-1' }, // 0: id
            { stringValue: matchId }, // 1: match_id
            { stringValue: 'uuid-player-1' }, // 2: player_profile_id
            { longValue: 1 }, // 3: in_game_participant_id
            { longValue: 100 }, // 4: team_id
            { longValue: 15653 }, // 5: gold_earned
            { longValue: 285 }, // 6: cs_total
            { longValue: 34585 }, // 7: total_damage_to_champions
            { longValue: 8 }, // 8: kills
            { longValue: 6 }, // 9: deaths
            { longValue: 12 }, // 10: assists
            { longValue: 42 }, // 11: vision_score
            { booleanValue: true }, // 12: win
            { stringValue: '{}' }, // 13: challenges
            { longValue: 2110 }, // 14: duration_seconds
            { longValue: 200 }, // 15: winning_team_id
            { stringValue: 'TOP' } // 16: individual_position
          ]]
        })
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Baron
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Dragon
        .mockResolvedValueOnce({ records: [[{ longValue: 0 }]] }) // Tower
        .mockResolvedValueOnce({ records: [] }) // First turret
        .mockResolvedValueOnce({ records: [[{ longValue: 20 }]] }) // Team kills (cached)
        .mockResolvedValueOnce({ records: [[{ longValue: 2 }]] }) // Solo deaths (2 out of 6)
        .mockResolvedValueOnce({ records: [] }); // Death timestamps

      await service.computeParticipantAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertParticipantAnalytics.mock.calls[0][0];

      // Verify error metrics
      expect(callArgs.deaths_per_minute).toBeCloseTo(0.17, 2); // 6 / (2110 / 60)
      expect(callArgs.kill_participation).toBeCloseTo(100.0, 1); // (8 + 12) / 20 = 100%
      expect(callArgs.unforced_death_rate).toBeCloseTo(33.33, 1); // 2 solo deaths / 6 total deaths
      expect(callArgs.survival_time_percent).toBeGreaterThan(90); // Should be high with only 6 deaths
    });

    it('should normalize scores to 0-100 scale', async () => {
      const matchId = 'uuid-match-123';

      // Mock participant with high performance
      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({
          // OPTIMIZATION: Batch opponents query
          records: [[
            { longValue: 1 }, { stringValue: 'TOP' }, { longValue: 100 }
          ]]
        })
        .mockResolvedValueOnce({ records: [] }) // OPTIMIZATION: Batch frames 10
        .mockResolvedValueOnce({ records: [] }) // OPTIMIZATION: Batch frames 15
        .mockResolvedValueOnce({
          // Participants query
          records: [[
            { stringValue: 'uuid-participant-1' }, // 0: id
            { stringValue: matchId }, // 1: match_id
            { stringValue: 'uuid-player-1' }, // 2: player_profile_id
            { longValue: 1 }, // 3: in_game_participant_id
            { longValue: 100 }, // 4: team_id
            { longValue: 15653 }, // 5: gold_earned
            { longValue: 285 }, // 6: cs_total
            { longValue: 34585 }, // 7: total_damage_to_champions
            { longValue: 8 }, // 8: kills
            { longValue: 3 }, // 9: deaths
            { longValue: 12 }, // 10: assists
            { longValue: 42 }, // 11: vision_score
            { booleanValue: true }, // 12: win
            { stringValue: JSON.stringify({ goldPerMinute: 445.07 }) }, // 13: challenges
            { longValue: 2110 }, // 14: duration_seconds
            { longValue: 200 }, // 15: winning_team_id
            { stringValue: 'TOP' } // 16: individual_position
          ]]
        })
        .mockResolvedValueOnce({
          // baron participation query
          records: [[{ longValue: 0 }]]
        })
        .mockResolvedValueOnce({
          // dragon participation query
          records: [[{ longValue: 0 }]]
        })
        .mockResolvedValueOnce({
          // tower participation query
          records: [[{ longValue: 0 }]]
        })
        .mockResolvedValueOnce({
          // first turret contribution query
          records: [] // No first turret contribution
        })
        .mockResolvedValueOnce({
          // team kills query
          records: [[{ longValue: 20 }]]
        })
        .mockResolvedValueOnce({
          // solo deaths query (for unforced death rate)
          records: [[{ longValue: 1 }]] // 1 solo death out of 3 total
        })
        .mockResolvedValueOnce({
          // death timestamps query (for tempo loss)
          records: [
            [{ longValue: 300000 }], // Death at 5 minutes
            [{ longValue: 600000 }], // Death at 10 minutes
            [{ longValue: 900000 }]  // Death at 15 minutes
          ]
        })
        .mockResolvedValueOnce({
          // gold frames query for first death
          records: [
            [{ longValue: 5 }, { longValue: 3000 }],  // Frame 5: 3000 gold
            [{ longValue: 7 }, { longValue: 3200 }]   // Frame 7: 3200 gold
          ]
        })
        .mockResolvedValueOnce({
          // gold frames query for second death
          records: [
            [{ longValue: 10 }, { longValue: 6000 }], // Frame 10: 6000 gold
            [{ longValue: 12 }, { longValue: 6300 }]  // Frame 12: 6300 gold
          ]
        })
        .mockResolvedValueOnce({
          // gold frames query for third death
          records: [
            [{ longValue: 15 }, { longValue: 9000 }], // Frame 15: 9000 gold
            [{ longValue: 17 }, { longValue: 9400 }]  // Frame 17: 9400 gold
          ]
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

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({
          // OPTIMIZATION: Batch opponents query
          records: [[
            { longValue: 1 }, { stringValue: 'TOP' }, { longValue: 100 }
          ]]
        })
        .mockResolvedValueOnce({ records: [] }) // OPTIMIZATION: Batch frames 10
        .mockResolvedValueOnce({ records: [] }) // OPTIMIZATION: Batch frames 15
        .mockResolvedValueOnce({
          // Participants query
          records: [[
            { stringValue: 'uuid-participant-1' }, // 0: id
            { stringValue: matchId }, // 1: match_id
            { stringValue: 'uuid-player-1' }, // 2: player_profile_id
            { longValue: 1 }, // 3: in_game_participant_id
            { longValue: 100 }, // 4: team_id
            { longValue: 15653 }, // 5: gold_earned
            { longValue: 285 }, // 6: cs_total
            { longValue: 34585 }, // 7: total_damage_to_champions
            { longValue: 8 }, // 8: kills
            { longValue: 3 }, // 9: deaths
            { longValue: 12 }, // 10: assists
            { longValue: 42 }, // 11: vision_score
            { booleanValue: true }, // 12: win
            { isNull: true }, // 13: NULL challenges
            { longValue: 2110 }, // 14: duration_seconds
            { longValue: 200 }, // 15: winning_team_id
            { stringValue: 'TOP' } // 16: individual_position
          ]]
        })
        .mockResolvedValueOnce({
          // baron participation query
          records: [[{ longValue: 0 }]]
        })
        .mockResolvedValueOnce({
          // dragon participation query
          records: [[{ longValue: 0 }]]
        })
        .mockResolvedValueOnce({
          // tower participation query
          records: [[{ longValue: 0 }]]
        })
        .mockResolvedValueOnce({
          // first turret contribution query
          records: [] // No first turret contribution
        })
        .mockResolvedValueOnce({
          // team kills query
          records: [[{ longValue: 20 }]]
        })
        .mockResolvedValueOnce({
          // solo deaths query (for unforced death rate)
          records: [[{ longValue: 1 }]] // 1 solo death out of 3 total
        })
        .mockResolvedValueOnce({
          // death timestamps query (for tempo loss)
          records: [
            [{ longValue: 300000 }], // Death at 5 minutes
            [{ longValue: 600000 }], // Death at 10 minutes
            [{ longValue: 900000 }]  // Death at 15 minutes
          ]
        })
        .mockResolvedValueOnce({
          // gold frames query for first death
          records: [
            [{ longValue: 5 }, { longValue: 3000 }],  // Frame 5: 3000 gold
            [{ longValue: 7 }, { longValue: 3200 }]   // Frame 7: 3200 gold
          ]
        })
        .mockResolvedValueOnce({
          // gold frames query for second death
          records: [
            [{ longValue: 10 }, { longValue: 6000 }], // Frame 10: 6000 gold
            [{ longValue: 12 }, { longValue: 6300 }]  // Frame 12: 6300 gold
          ]
        })
        .mockResolvedValueOnce({
          // gold frames query for third death
          records: [
            [{ longValue: 15 }, { longValue: 9000 }], // Frame 15: 9000 gold
            [{ longValue: 17 }, { longValue: 9400 }]  // Frame 17: 9400 gold
          ]
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

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({
          // First blood query
          records: [[
            { longValue: 125000 }, // timestamp_ms
            { longValue: 3 } // killer_participant_id
          ]]
        })
        .mockResolvedValueOnce({
          // Team lookup for first blood killer
          records: [[
            { longValue: 100 } // team_id
          ]]
        })
        .mockResolvedValueOnce({
          // First tower query (service always queries this)
          records: [] // No first tower in this test
        })
        .mockResolvedValueOnce({
          // First dragon query
          records: [] // No first dragon in this test
        })
        .mockResolvedValueOnce({
          // First baron query
          records: [] // No first baron in this test
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
            { longValue: 420000 }, // timestamp_ms
            { longValue: 5 } // killer_participant_id
          ]]
        })
        .mockResolvedValueOnce({
          // Team lookup for tower killer
          records: [[
            { longValue: 100 } // team_id
          ]]
        })
        .mockResolvedValueOnce({
          // First dragon query
          records: [] // No first dragon in this test
        })
        .mockResolvedValueOnce({
          // First baron query
          records: [] // No first baron in this test
        });

      await service.computeTimelineAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertTimelineAnalytics.mock.calls[0][0];

      expect(callArgs.first_tower_timestamp_ms).toBe(420000);
      expect(callArgs.first_tower_team_id).toBe(100);
    });

    it('should extract first dragon from ELITE_MONSTER_KILL events', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({ records: [] }) // No first blood
        .mockResolvedValueOnce({ records: [] }) // No first tower
        .mockResolvedValueOnce({
          // First dragon
          records: [[
            { longValue: 360000 }, // timestamp_ms
            { longValue: 200 } // killer_team_id
          ]]
        })
        .mockResolvedValueOnce({ records: [] }); // No first baron

      await service.computeTimelineAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertTimelineAnalytics.mock.calls[0][0];

      expect(callArgs.first_dragon_timestamp_ms).toBe(360000);
      expect(callArgs.first_dragon_team_id).toBe(200);
    });

    it('should extract first baron from ELITE_MONSTER_KILL events', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({ records: [] }) // No first blood
        .mockResolvedValueOnce({ records: [] }) // No first tower
        .mockResolvedValueOnce({ records: [] }) // No first dragon
        .mockResolvedValueOnce({
          // First baron
          records: [[
            { longValue: 1200000 }, // timestamp_ms
            { longValue: 100 } // killer_team_id
          ]]
        });

      await service.computeTimelineAnalytics(matchId);

      const callArgs = mockAnalyticsRepo.upsertTimelineAnalytics.mock.calls[0][0];

      expect(callArgs.first_baron_timestamp_ms).toBe(1200000);
      expect(callArgs.first_baron_team_id).toBe(100);
    });

    it('should handle matches with no first blood', async () => {
      const matchId = 'uuid-match-123';

      mockRdsClient.executeStatement = jest.fn()
        .mockResolvedValueOnce({ records: [] }) // No first blood
        .mockResolvedValueOnce({ records: [] }) // No first tower
        .mockResolvedValueOnce({ records: [] }) // No first dragon
        .mockResolvedValueOnce({ records: [] }); // No first baron

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
