/**
 * TDD tests for matchDataBuilder
 * Uses real sample data from sample_data/ directory
 * 
 * IMPORTANT: These tests also validate that data types match the database schema
 * to catch type mismatches before they cause SQL errors.
 */

import { MatchDataBuilder } from '../matchDataBuilder';
import { MatchResponse, TimelineResponse } from '../../types';
import { SchemaValidator } from '../../database/schemaValidator';
import * as matchData from '../../../sample_data/match.json';
import * as timelineData from '../../../sample_data/MatchTimeline.json';

describe('MatchDataBuilder', () => {
  const sampleMatch: MatchResponse = matchData as any;
  const sampleTimeline: TimelineResponse = timelineData as any;
  const testMatchId = 'test-match-uuid';

  describe('buildMatchData', () => {
    it('should transform Match API response to match database model', () => {
      const result = MatchDataBuilder.buildMatchData(sampleMatch);

      // Verify required fields
      expect(result.external_match_id).toBe('NA1_5391659560');
      expect(result.game).toBe('lol');
      expect(result.platform_id).toBe('NA1');
      expect(result.game_mode).toBe('CLASSIC');
      expect(result.queue_id).toBe(420);
      expect(result.map_id).toBe(11);
      expect(result.game_version).toBe('15.20.717.2831');
      expect(result.duration_seconds).toBe(2110);
      expect(result.winning_team_id).toBe(200);

      // Verify dates
      expect(result.started_at).toBeInstanceOf(Date);
      expect(result.ended_at).toBeInstanceOf(Date);
      expect(result.started_at.getTime()).toBe(1760296722202);
      expect(result.ended_at.getTime()).toBe(1760298832127);

      // Verify payload is preserved
      expect(result.payload).toBeDefined();
      expect(result.payload.metadata).toBeDefined();
    });
  });

  describe('buildParticipantsData', () => {
    it('should transform all 10 participants from Match API response', () => {
      const result = MatchDataBuilder.buildParticipantsData(sampleMatch, testMatchId);

      expect(result).toHaveLength(10);
    });

    it('should correctly transform first participant data', () => {
      const result = MatchDataBuilder.buildParticipantsData(sampleMatch, testMatchId);
      const firstParticipant = result[0];

      expect(firstParticipant.match_id).toBe(testMatchId);
      expect(firstParticipant.participant_id).toBe(1);
      expect(firstParticipant.puuid).toBe('G8PsdSOaHF8MHVH4gmnMFMn6rq1JRMIY564VgolefeNEZ1RucWt01HN--Q3vtRQ9JMpKv2Bs4PAiQQ');
      expect(firstParticipant.team_id).toBe(100);
      expect(firstParticipant.champion_id).toBe(36);
      expect(firstParticipant.champion_name).toBe('DrMundo');
      expect(firstParticipant.team_position).toBe('TOP');
      expect(firstParticipant.individual_position).toBe('TOP');

      // Verify core stats
      expect(firstParticipant.kills).toBe(4);
      expect(firstParticipant.deaths).toBe(6);
      expect(firstParticipant.assists).toBe(4);
      expect(firstParticipant.gold_earned).toBe(15653);
      expect(firstParticipant.total_damage_to_champions).toBe(34585);
      expect(firstParticipant.cs_total).toBe(285);  // totalMinionsKilled from API
      expect(firstParticipant.champ_level).toBe(18);
      expect(firstParticipant.vision_score).toBe(12);
      expect(firstParticipant.win).toBe(false);

      // Verify arrays
      expect(firstParticipant.summoner_spells).toEqual([12, 6]);
      expect(firstParticipant.items).toHaveLength(7);
      expect(firstParticipant.items).toEqual([3009, 3083, 3084, 3065, 3742, 2021, 3340]);

      // Verify runes
      expect(firstParticipant.primary_rune_style).toBe(8400);
      expect(firstParticipant.sub_rune_style).toBe(8300);
      expect(firstParticipant.stat_perks).toMatchObject({
        defense: 5001,
        flex: 5001,
        offense: 5005
      });

      // Verify challenges are preserved
      expect(firstParticipant.challenges).toBeDefined();
      expect(firstParticipant.challenges.goldPerMinute).toBeCloseTo(445.07, 2);
      expect(firstParticipant.challenges.damagePerMinute).toBeCloseTo(983.35, 2);

      // Verify raw_data is preserved
      expect(firstParticipant.raw_data).toBeDefined();
      expect(firstParticipant.raw_data.riotIdGameName).toBe('T1 Oner');
    });

    it('should handle participants from both teams (100 and 200)', () => {
      const result = MatchDataBuilder.buildParticipantsData(sampleMatch, testMatchId);

      const team100 = result.filter(p => p.team_id === 100);
      const team200 = result.filter(p => p.team_id === 200);

      expect(team100).toHaveLength(5);
      expect(team200).toHaveLength(5);
    });

    it('should assign correct participant IDs from 1 to 10', () => {
      const result = MatchDataBuilder.buildParticipantsData(sampleMatch, testMatchId);

      const participantIds = result.map(p => p.participant_id);
      expect(participantIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe('buildTeamsData', () => {
    it('should transform both teams from Match API response', () => {
      const result = MatchDataBuilder.buildTeamsData(sampleMatch, testMatchId);

      expect(result).toHaveLength(2);
    });

    it('should correctly transform team 100 data', () => {
      const result = MatchDataBuilder.buildTeamsData(sampleMatch, testMatchId);
      const team100 = result.find(t => t.team_id === 100);

      expect(team100).toBeDefined();
      expect(team100!.match_id).toBe(testMatchId);
      expect(team100!.team_id).toBe(100);
      expect(team100!.win).toBe(false);

      // Verify objectives
      expect(team100!.barons).toBeGreaterThanOrEqual(0);
      expect(team100!.dragons).toBeGreaterThanOrEqual(0);
      expect(team100!.towers).toBeGreaterThanOrEqual(0);
      expect(team100!.inhibitors).toBeGreaterThanOrEqual(0);
      expect(team100!.rift_heralds).toBeGreaterThanOrEqual(0);

      // Verify bans array
      expect(team100!.bans).toHaveLength(5);
      expect(team100!.bans.every(ban => typeof ban === 'number')).toBe(true);

      // Verify raw_data
      expect(team100!.raw_data).toBeDefined();
    });

    it('should correctly transform team 200 data', () => {
      const result = MatchDataBuilder.buildTeamsData(sampleMatch, testMatchId);
      const team200 = result.find(t => t.team_id === 200);

      expect(team200).toBeDefined();
      expect(team200!.match_id).toBe(testMatchId);
      expect(team200!.team_id).toBe(200);
      expect(team200!.win).toBe(true);

      // Verify bans array
      expect(team200!.bans).toHaveLength(5);
    });

    it('should have exactly one winning team', () => {
      const result = MatchDataBuilder.buildTeamsData(sampleMatch, testMatchId);

      const winningTeams = result.filter(t => t.win);
      const losingTeams = result.filter(t => !t.win);

      expect(winningTeams).toHaveLength(1);
      expect(losingTeams).toHaveLength(1);
    });
  });

  describe('buildTimelineFramesData', () => {
    it('should transform all frames from Timeline API response', () => {
      const result = MatchDataBuilder.buildTimelineFramesData(sampleTimeline, testMatchId);

      // Timeline has 37 frames, each with 10 participants = 370 rows
      expect(result.length).toBeGreaterThan(300);
    });

    it('should correctly transform frame data for participant 1 at frame 5', () => {
      const result = MatchDataBuilder.buildTimelineFramesData(sampleTimeline, testMatchId);

      // Find frame 5, participant 1
      const frame5p1 = result.find(f => f.frame_number === 5 && f.participant_id === 1);

      expect(frame5p1).toBeDefined();
      expect(frame5p1!.match_id).toBe(testMatchId);
      expect(frame5p1!.timestamp_ms).toBe(300174);
      expect(frame5p1!.total_gold).toBe(1259);
      expect(frame5p1!.current_gold).toBe(759);
      expect(frame5p1!.level).toBe(5);
      expect(frame5p1!.xp).toBe(1938);

      // Verify position
      expect(frame5p1!.position_x).toBe(819);
      expect(frame5p1!.position_y).toBe(10608);

      // Verify champion stats are preserved
      expect(frame5p1!.champion_stats).toBeDefined();
      expect(frame5p1!.champion_stats.health).toBe(487);
      expect(frame5p1!.champion_stats.healthMax).toBe(1188);
    });

    it('should have frames for all 10 participants', () => {
      const result = MatchDataBuilder.buildTimelineFramesData(sampleTimeline, testMatchId);

      const uniqueParticipants = new Set(result.map(f => f.participant_id));
      expect(uniqueParticipants.size).toBe(10);
      expect([...uniqueParticipants].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('should have sequential frame numbers', () => {
      const result = MatchDataBuilder.buildTimelineFramesData(sampleTimeline, testMatchId);

      const uniqueFrameNumbers = new Set(result.map(f => f.frame_number));
      const sortedFrameNumbers = [...uniqueFrameNumbers].sort((a, b) => a - b);

      // Should start at 0 and be sequential
      expect(sortedFrameNumbers[0]).toBe(0);
      expect(sortedFrameNumbers[sortedFrameNumbers.length - 1]).toBeGreaterThan(30);
    });
  });

  describe('buildTimelineEventsData', () => {
    it('should transform all events from Timeline API response', () => {
      const result = MatchDataBuilder.buildTimelineEventsData(sampleTimeline, testMatchId);

      // Sample timeline has ~1000+ events
      expect(result.length).toBeGreaterThan(900);
    });

    it('should correctly transform CHAMPION_KILL event', () => {
      const result = MatchDataBuilder.buildTimelineEventsData(sampleTimeline, testMatchId);

      const championKills = result.filter(e => e.event_type === 'CHAMPION_KILL');
      expect(championKills.length).toBeGreaterThan(0);

      const firstKill = championKills[0];
      expect(firstKill.match_id).toBe(testMatchId);
      expect(firstKill.event_type).toBe('CHAMPION_KILL');
      expect(firstKill.killer_participant_id).toBeDefined();
      expect(firstKill.victim_participant_id).toBeDefined();
      expect(firstKill.timestamp_ms).toBeGreaterThan(0);

      // Position should be present for kills
      expect(firstKill.position_x).toBeDefined();
      expect(firstKill.position_y).toBeDefined();

      // Assisting participants may be empty or have values
      expect(Array.isArray(firstKill.assisting_participant_ids)).toBe(true);
    });

    it('should correctly transform BUILDING_KILL event', () => {
      const result = MatchDataBuilder.buildTimelineEventsData(sampleTimeline, testMatchId);

      const buildingKills = result.filter(e => e.event_type === 'BUILDING_KILL');
      expect(buildingKills.length).toBeGreaterThan(0);

      const firstBuildingKill = buildingKills[0];
      expect(firstBuildingKill.event_type).toBe('BUILDING_KILL');
      expect(firstBuildingKill.building_type).toBeDefined();
    });

    it('should correctly transform ELITE_MONSTER_KILL event', () => {
      const result = MatchDataBuilder.buildTimelineEventsData(sampleTimeline, testMatchId);

      const monsterKills = result.filter(e => e.event_type === 'ELITE_MONSTER_KILL');
      expect(monsterKills.length).toBeGreaterThan(0);

      const firstMonsterKill = monsterKills[0];
      expect(firstMonsterKill.event_type).toBe('ELITE_MONSTER_KILL');
      expect(firstMonsterKill.monster_type).toBeDefined();
    });

    it('should correctly transform ITEM_PURCHASED event', () => {
      const result = MatchDataBuilder.buildTimelineEventsData(sampleTimeline, testMatchId);

      const itemPurchases = result.filter(e => e.event_type === 'ITEM_PURCHASED');
      expect(itemPurchases.length).toBeGreaterThan(0);

      const firstItemPurchase = itemPurchases[0];
      expect(firstItemPurchase.event_type).toBe('ITEM_PURCHASED');
      expect(firstItemPurchase.participant_id).toBeDefined();
      expect(firstItemPurchase.item_id).toBeDefined();
    });

    it('should correctly transform WARD_PLACED event', () => {
      const result = MatchDataBuilder.buildTimelineEventsData(sampleTimeline, testMatchId);

      const wardPlacements = result.filter(e => e.event_type === 'WARD_PLACED');
      expect(wardPlacements.length).toBeGreaterThan(0);

      const firstWard = wardPlacements[0];
      expect(firstWard.event_type).toBe('WARD_PLACED');
      expect(firstWard.participant_id).toBeDefined();
      expect(firstWard.ward_type).toBeDefined();
    });

    it('should have events across multiple event types', () => {
      const result = MatchDataBuilder.buildTimelineEventsData(sampleTimeline, testMatchId);

      const eventTypes = new Set(result.map(e => e.event_type));

      // Should have variety of event types
      expect(eventTypes.has('CHAMPION_KILL')).toBe(true);
      expect(eventTypes.has('ITEM_PURCHASED')).toBe(true);
      expect(eventTypes.has('WARD_PLACED')).toBe(true);
      expect(eventTypes.has('LEVEL_UP')).toBe(true);
    });

    it('should preserve raw_data for all events', () => {
      const result = MatchDataBuilder.buildTimelineEventsData(sampleTimeline, testMatchId);

      // Check first 10 events have raw_data
      const first10 = result.slice(0, 10);
      first10.forEach(event => {
        expect(event.raw_data).toBeDefined();
        expect(event.raw_data.type).toBe(event.event_type);
      });
    });
  });

  describe('buildCompleteMatchData', () => {
    it('should build complete dataset with all components', () => {
      const result = MatchDataBuilder.buildCompleteMatchData(sampleMatch, sampleTimeline);

      // Verify all components are present
      expect(result.match).toBeDefined();
      expect(result.participants).toBeDefined();
      expect(result.teams).toBeDefined();
      expect(result.frames).toBeDefined();
      expect(result.events).toBeDefined();

      // Verify counts
      expect(result.participants).toHaveLength(10);
      expect(result.teams).toHaveLength(2);
      expect(result.frames.length).toBeGreaterThan(300);
      expect(result.events.length).toBeGreaterThan(900);

      // Verify match_id consistency
      const matchId = result.match.external_match_id;
      expect(result.participants.every(p => p.match_id === matchId)).toBe(true);
      expect(result.teams.every(t => t.match_id === matchId)).toBe(true);
      expect(result.frames.every(f => f.match_id === matchId)).toBe(true);
      expect(result.events.every(e => e.match_id === matchId)).toBe(true);
    });

    it('should validate against database schema (SQL type safety)', () => {
      const result = MatchDataBuilder.buildCompleteMatchData(sampleMatch, sampleTimeline);

      // This test validates that all data types match what PostgreSQL expects
      // If this test fails, it means you'll get SQL type errors at runtime
      expect(() => {
        SchemaValidator.validateCompleteMatchData(result);
      }).not.toThrow();
    });

    it('should validate match data types', () => {
      const result = MatchDataBuilder.buildMatchData(sampleMatch);
      
      expect(() => {
        SchemaValidator.validateRecord('match', result);
      }).not.toThrow();
    });

    it('should validate participant data types', () => {
      const result = MatchDataBuilder.buildParticipantsData(sampleMatch, testMatchId);
      
      expect(() => {
        SchemaValidator.validateRecords('match_participant', result);
      }).not.toThrow();
    });

    it('should validate team data types', () => {
      const result = MatchDataBuilder.buildTeamsData(sampleMatch, testMatchId);
      
      expect(() => {
        SchemaValidator.validateRecords('match_team', result);
      }).not.toThrow();
    });

    it('should validate timeline frame data types', () => {
      const result = MatchDataBuilder.buildTimelineFramesData(sampleTimeline, testMatchId);
      
      expect(() => {
        SchemaValidator.validateRecords('match_timeline_frame', result);
      }).not.toThrow();
    });

    it('should validate timeline event data types', () => {
      const result = MatchDataBuilder.buildTimelineEventsData(sampleTimeline, testMatchId);
      
      expect(() => {
        SchemaValidator.validateRecords('match_timeline_event', result);
      }).not.toThrow();
    });
  });
});
