/**
 * matchDataBuilder.ts
 *
 * Transforms Riot Match-V5 API responses into database models for BRONZE layer storage.
 * Uses builder pattern for ETL: Extract (API) → Transform (this) → Load (Repository)
 */

import {
  MatchResponse,
  TimelineResponse,
  MatchParticipant,
  MatchTeam,
  TimelineFrame,
  TimelineEvent
} from '../types';

// ============================================
// Database Model Interfaces
// ============================================

export interface MatchData {
  external_match_id: string;
  game: string;
  platform_id: string;
  game_mode: string;
  queue_id: number;
  map_id: number;
  game_version: string;
  duration_seconds: number;
  started_at: Date;
  ended_at: Date;
  winning_team_id: number;
  payload: any;
}

export interface MatchParticipantData {
  match_id: string;  // Will be replaced with UUID after match insertion
  participant_id: number;
  puuid: string;
  team_id: number;
  champion_id: number;
  champion_name: string;
  team_position: string;
  individual_position: string;
  summoner_spells: number[];
  items: number[];
  kills: number;
  deaths: number;
  assists: number;
  gold_earned: number;
  total_damage_to_champions: number;
  cs_total: number;
  champ_level: number;
  vision_score: number;
  win: boolean;
  primary_rune_style: number | null;
  sub_rune_style: number | null;
  stat_perks: any;
  challenges: any;
  raw_data: any;
}

export interface MatchTeamData {
  match_id: string;  // Will be replaced with UUID after match insertion
  team_id: number;
  win: boolean;
  barons: number;
  dragons: number;
  towers: number;
  inhibitors: number;
  rift_heralds: number;
  bans: number[];
  raw_data: any;
}

export interface TimelineFrameData {
  match_id: string;
  frame_number: number;
  timestamp_ms: number;
  participant_id: number;
  total_gold: number;
  current_gold: number;
  gold_per_second: number;
  xp: number;
  level: number;
  position_x: number | null;
  position_y: number | null;
  champion_stats: any;
}

export interface TimelineEventData {
  match_id: string;
  frame_number: number;
  timestamp_ms: number;
  event_type: string;
  participant_id: number | null;
  killer_participant_id: number | null;
  victim_participant_id: number | null;
  assisting_participant_ids: number[];
  position_x: number | null;
  position_y: number | null;
  building_type: string | null;
  tower_type: string | null;
  lane_type: string | null;
  monster_type: string | null;
  monster_sub_type: string | null;
  item_id: number | null;
  skill_slot: number | null;
  ward_type: string | null;
  raw_data: any;
}

// ============================================
// Builder Class
// ============================================

export class MatchDataBuilder {

  /**
   * Build match data from Match-V5 API response
   */
  static buildMatchData(matchResponse: MatchResponse): MatchData {
    const { metadata, info } = matchResponse;

    return {
      external_match_id: metadata.matchId,
      game: 'lol',
      platform_id: info.platformId,
      game_mode: info.gameMode,
      queue_id: info.queueId,
      map_id: info.mapId,
      game_version: info.gameVersion,
      duration_seconds: info.gameDuration,
      started_at: new Date(info.gameStartTimestamp),
      ended_at: new Date(info.gameEndTimestamp),
      winning_team_id: info.teams.find(t => t.win)?.teamId || 0,
      payload: matchResponse
    };
  }

  /**
   * Build participant data array from Match-V5 API response
   */
  static buildParticipantsData(matchResponse: MatchResponse, matchId: string): MatchParticipantData[] {
    const { info } = matchResponse;

    return info.participants.map((participant, index) => {
      // Participant ID is 1-indexed
      const participantId = index + 1;

      // Extract rune/perk styles
      const primaryRuneStyle = participant.perks?.styles?.[0]?.style || null;
      const subRuneStyle = participant.perks?.styles?.[1]?.style || null;
      const statPerks = participant.perks?.statPerks || null;

      return {
        match_id: matchId,
        participant_id: participantId,
        puuid: participant.puuid,
        team_id: participant.teamId,
        champion_id: participant.championId,
        champion_name: participant.championName,
        team_position: participant.teamPosition,
        individual_position: participant.individualPosition,
        summoner_spells: [participant.summoner1Id, participant.summoner2Id],
        items: [
          participant.item0,
          participant.item1,
          participant.item2,
          participant.item3,
          participant.item4,
          participant.item5,
          participant.item6
        ],
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        gold_earned: participant.goldEarned,
        total_damage_to_champions: participant.totalDamageDealtToChampions,
        cs_total: participant.totalMinionsKilled,
        champ_level: participant.champLevel,
        vision_score: participant.visionScore,
        win: participant.win,
        primary_rune_style: primaryRuneStyle,
        sub_rune_style: subRuneStyle,
        stat_perks: statPerks,
        challenges: participant.challenges || {},
        raw_data: participant
      };
    });
  }

  /**
   * Build team data array from Match-V5 API response
   */
  static buildTeamsData(matchResponse: MatchResponse, matchId: string): MatchTeamData[] {
    const { info } = matchResponse;

    return info.teams.map(team => ({
      match_id: matchId,
      team_id: team.teamId,
      win: team.win,
      barons: team.objectives.baron?.kills || 0,
      dragons: team.objectives.dragon?.kills || 0,
      towers: team.objectives.tower?.kills || 0,
      inhibitors: team.objectives.inhibitor?.kills || 0,
      rift_heralds: team.objectives.riftHerald?.kills || 0,
      bans: team.bans.map(ban => ban.championId),
      raw_data: team
    }));
  }

  /**
   * Build timeline frame data from Timeline API response
   */
  static buildTimelineFramesData(timelineResponse: TimelineResponse, matchId: string): TimelineFrameData[] {
    const { info } = timelineResponse;
    const framesData: TimelineFrameData[] = [];

    info.frames.forEach((frame, frameIndex) => {
      // participantFrames is an object with keys "1" through "10"
      Object.entries(frame.participantFrames).forEach(([participantIdStr, participantFrame]) => {
        const participantId = parseInt(participantIdStr, 10);

        framesData.push({
          match_id: matchId,
          frame_number: frameIndex,
          timestamp_ms: frame.timestamp,
          participant_id: participantId,
          total_gold: participantFrame.totalGold,
          current_gold: participantFrame.currentGold,
          gold_per_second: participantFrame.goldPerSecond,
          xp: participantFrame.xp,
          level: participantFrame.level,
          position_x: participantFrame.position?.x || null,
          position_y: participantFrame.position?.y || null,
          champion_stats: participantFrame.championStats
        });
      });
    });

    return framesData;
  }

  /**
   * Build timeline event data from Timeline API response
   */
  static buildTimelineEventsData(timelineResponse: TimelineResponse, matchId: string): TimelineEventData[] {
    const { info } = timelineResponse;
    const eventsData: TimelineEventData[] = [];

    info.frames.forEach((frame, frameIndex) => {
      frame.events.forEach(event => {
        eventsData.push({
          match_id: matchId,
          frame_number: frameIndex,
          timestamp_ms: event.timestamp,
          event_type: event.type,
          participant_id: event.participantId || null,
          killer_participant_id: event.killerId || null,
          victim_participant_id: event.victimId || null,
          assisting_participant_ids: event.assistingParticipantIds || [],
          position_x: event.position?.x || null,
          position_y: event.position?.y || null,
          building_type: event.buildingType || null,
          tower_type: event.towerType || null,
          lane_type: event.laneType || null,
          monster_type: event.monsterType || null,
          monster_sub_type: event.monsterSubType || null,
          item_id: event.itemId || null,
          skill_slot: event.skillSlot || null,
          ward_type: event.wardType || null,
          raw_data: event
        });
      });
    });

    return eventsData;
  }

  /**
   * Build complete match dataset from both Match and Timeline API responses
   * This is a convenience method that calls all builders
   */
  static buildCompleteMatchData(matchResponse: MatchResponse, timelineResponse: TimelineResponse) {
    const matchData = this.buildMatchData(matchResponse);

    return {
      match: matchData,
      participants: this.buildParticipantsData(matchResponse, matchData.external_match_id),
      teams: this.buildTeamsData(matchResponse, matchData.external_match_id),
      frames: this.buildTimelineFramesData(timelineResponse, matchData.external_match_id),
      events: this.buildTimelineEventsData(timelineResponse, matchData.external_match_id)
    };
  }
}
