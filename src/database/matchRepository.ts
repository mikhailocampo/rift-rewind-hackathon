/**
 * matchRepository.ts
 *
 * Handles database operations for BRONZE layer match data.
 * Uses AWS RDS Data API for serverless Aurora PostgreSQL access.
 */

import { RDSDataService } from 'aws-sdk';
import {
  MatchData,
  MatchParticipantData,
  MatchTeamData,
  TimelineFrameData,
  TimelineEventData
} from '../builders/matchDataBuilder';

export class MatchRepository {
  private rdsData: RDSDataService;
  private resourceArn: string;
  private secretArn: string;
  private database: string;

  constructor() {
    this.rdsData = new RDSDataService();
    this.resourceArn = process.env.RDS_CLUSTER_ARN!;
    this.secretArn = process.env.RDS_SECRET_ARN!;
    this.database = process.env.DATABASE_NAME || 'postgres';
  }

  /**
   * Upsert match data (idempotent by external_match_id)
   * Returns the UUID of the match row
   */
  async upsertMatch(matchData: MatchData): Promise<string> {
    const sql = `
      INSERT INTO match (
        external_match_id, game, platform_id, game_mode, queue_id, map_id,
        game_version, duration_seconds, started_at, ended_at, winning_team_id, payload
      ) VALUES (
        :external_match_id, :game, :platform_id, :game_mode, :queue_id, :map_id,
        :game_version, :duration_seconds, :started_at, :ended_at, :winning_team_id, :payload
      )
      ON CONFLICT (game, external_match_id) DO UPDATE SET
        platform_id = EXCLUDED.platform_id,
        game_mode = EXCLUDED.game_mode,
        queue_id = EXCLUDED.queue_id,
        map_id = EXCLUDED.map_id,
        game_version = EXCLUDED.game_version,
        duration_seconds = EXCLUDED.duration_seconds,
        started_at = EXCLUDED.started_at,
        ended_at = EXCLUDED.ended_at,
        winning_team_id = EXCLUDED.winning_team_id,
        payload = EXCLUDED.payload
      RETURNING id
    `;

    const result = await this.rdsData.executeStatement({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql,
      parameters: [
        { name: 'external_match_id', value: { stringValue: matchData.external_match_id } },
        { name: 'game', value: { stringValue: matchData.game } },
        { name: 'platform_id', value: { stringValue: matchData.platform_id } },
        { name: 'game_mode', value: { stringValue: matchData.game_mode } },
        { name: 'queue_id', value: { longValue: matchData.queue_id } },
        { name: 'map_id', value: { longValue: matchData.map_id } },
        { name: 'game_version', value: { stringValue: matchData.game_version } },
        { name: 'duration_seconds', value: { longValue: matchData.duration_seconds } },
        { name: 'started_at', value: { stringValue: matchData.started_at.toISOString() } },
        { name: 'ended_at', value: { stringValue: matchData.ended_at.toISOString() } },
        { name: 'winning_team_id', value: { longValue: matchData.winning_team_id } },
        { name: 'payload', value: { stringValue: JSON.stringify(matchData.payload) } }
      ]
    }).promise();

    const matchId = result.records?.[0]?.[0]?.stringValue;
    if (!matchId) {
      throw new Error('Failed to get match ID from database');
    }

    return matchId;
  }

  /**
   * Insert participants for a match
   * Deletes existing participants first to ensure idempotency
   */
  async insertParticipants(matchId: string, participants: MatchParticipantData[]): Promise<void> {
    // First, delete existing participants for this match (idempotency)
    await this.rdsData.executeStatement({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql: 'DELETE FROM match_participant WHERE match_id = :match_id',
      parameters: [{ name: 'match_id', value: { stringValue: matchId } }]
    }).promise();

    // Batch insert participants
    for (const participant of participants) {
      const sql = `
        INSERT INTO match_participant (
          match_id, participant_id, puuid, team_id, champion_id, champion_name,
          team_position, individual_position, summoner_spells, items,
          kills, deaths, assists, gold_earned, total_damage_to_champions,
          cs_total, champ_level, vision_score, win,
          primary_rune_style, sub_rune_style, stat_perks, challenges, raw_data
        ) VALUES (
          :match_id, :participant_id, :puuid, :team_id, :champion_id, :champion_name,
          :team_position, :individual_position, :summoner_spells, :items,
          :kills, :deaths, :assists, :gold_earned, :total_damage_to_champions,
          :cs_total, :champ_level, :vision_score, :win,
          :primary_rune_style, :sub_rune_style, :stat_perks, :challenges, :raw_data
        )
      `;

      await this.rdsData.executeStatement({
        resourceArn: this.resourceArn,
        secretArn: this.secretArn,
        database: this.database,
        sql,
        parameters: [
          { name: 'match_id', value: { stringValue: matchId } },
          { name: 'participant_id', value: { longValue: participant.participant_id } },
          { name: 'puuid', value: { stringValue: participant.puuid } },
          { name: 'team_id', value: { longValue: participant.team_id } },
          { name: 'champion_id', value: { longValue: participant.champion_id } },
          { name: 'champion_name', value: { stringValue: participant.champion_name } },
          { name: 'team_position', value: { stringValue: participant.team_position || '' } },
          { name: 'individual_position', value: { stringValue: participant.individual_position || '' } },
          { name: 'summoner_spells', value: { stringValue: `{${participant.summoner_spells.join(',')}}` } },
          { name: 'items', value: { stringValue: `{${participant.items.join(',')}}` } },
          { name: 'kills', value: { longValue: participant.kills } },
          { name: 'deaths', value: { longValue: participant.deaths } },
          { name: 'assists', value: { longValue: participant.assists } },
          { name: 'gold_earned', value: { longValue: participant.gold_earned } },
          { name: 'total_damage_to_champions', value: { longValue: participant.total_damage_to_champions } },
          { name: 'cs_total', value: { longValue: participant.cs_total } },
          { name: 'champ_level', value: { longValue: participant.champ_level } },
          { name: 'vision_score', value: { longValue: participant.vision_score } },
          { name: 'win', value: { booleanValue: participant.win } },
          { name: 'primary_rune_style', value: participant.primary_rune_style ? { longValue: participant.primary_rune_style } : { isNull: true } },
          { name: 'sub_rune_style', value: participant.sub_rune_style ? { longValue: participant.sub_rune_style } : { isNull: true } },
          { name: 'stat_perks', value: { stringValue: JSON.stringify(participant.stat_perks) } },
          { name: 'challenges', value: { stringValue: JSON.stringify(participant.challenges) } },
          { name: 'raw_data', value: { stringValue: JSON.stringify(participant.raw_data) } }
        ]
      }).promise();
    }
  }

  /**
   * Insert teams for a match
   * Deletes existing teams first to ensure idempotency
   */
  async insertTeams(matchId: string, teams: MatchTeamData[]): Promise<void> {
    // First, delete existing teams for this match
    await this.rdsData.executeStatement({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql: 'DELETE FROM match_team WHERE match_id = :match_id',
      parameters: [{ name: 'match_id', value: { stringValue: matchId } }]
    }).promise();

    // Insert teams
    for (const team of teams) {
      const sql = `
        INSERT INTO match_team (
          match_id, team_id, win, barons, dragons, towers, inhibitors, rift_heralds, bans, raw_data
        ) VALUES (
          :match_id, :team_id, :win, :barons, :dragons, :towers, :inhibitors, :rift_heralds, :bans, :raw_data
        )
      `;

      await this.rdsData.executeStatement({
        resourceArn: this.resourceArn,
        secretArn: this.secretArn,
        database: this.database,
        sql,
        parameters: [
          { name: 'match_id', value: { stringValue: matchId } },
          { name: 'team_id', value: { longValue: team.team_id } },
          { name: 'win', value: { booleanValue: team.win } },
          { name: 'barons', value: { longValue: team.barons } },
          { name: 'dragons', value: { longValue: team.dragons } },
          { name: 'towers', value: { longValue: team.towers } },
          { name: 'inhibitors', value: { longValue: team.inhibitors } },
          { name: 'rift_heralds', value: { longValue: team.rift_heralds } },
          { name: 'bans', value: { stringValue: `{${team.bans.join(',')}}` } },
          { name: 'raw_data', value: { stringValue: JSON.stringify(team.raw_data) } }
        ]
      }).promise();
    }
  }

  /**
   * Bulk insert timeline frames
   * Deletes existing frames first to ensure idempotency
   */
  async insertTimelineFrames(matchId: string, frames: TimelineFrameData[]): Promise<void> {
    // Delete existing frames for this match
    await this.rdsData.executeStatement({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql: 'DELETE FROM match_timeline_frame WHERE match_id = :match_id',
      parameters: [{ name: 'match_id', value: { stringValue: matchId } }]
    }).promise();

    // Batch insert frames (RDS Data API has parameter limits, so we batch)
    const batchSize = 50;
    for (let i = 0; i < frames.length; i += batchSize) {
      const batch = frames.slice(i, i + batchSize);

      for (const frame of batch) {
        const sql = `
          INSERT INTO match_timeline_frame (
            match_id, frame_number, timestamp_ms, participant_id,
            total_gold, current_gold, gold_per_second, xp, level,
            position_x, position_y, champion_stats
          ) VALUES (
            :match_id, :frame_number, :timestamp_ms, :participant_id,
            :total_gold, :current_gold, :gold_per_second, :xp, :level,
            :position_x, :position_y, :champion_stats
          )
        `;

        await this.rdsData.executeStatement({
          resourceArn: this.resourceArn,
          secretArn: this.secretArn,
          database: this.database,
          sql,
          parameters: [
            { name: 'match_id', value: { stringValue: matchId } },
            { name: 'frame_number', value: { longValue: frame.frame_number } },
            { name: 'timestamp_ms', value: { longValue: frame.timestamp_ms } },
            { name: 'participant_id', value: { longValue: frame.participant_id } },
            { name: 'total_gold', value: { longValue: frame.total_gold } },
            { name: 'current_gold', value: { longValue: frame.current_gold } },
            { name: 'gold_per_second', value: { longValue: frame.gold_per_second } },
            { name: 'xp', value: { longValue: frame.xp } },
            { name: 'level', value: { longValue: frame.level } },
            { name: 'position_x', value: frame.position_x ? { longValue: frame.position_x } : { isNull: true } },
            { name: 'position_y', value: frame.position_y ? { longValue: frame.position_y } : { isNull: true } },
            { name: 'champion_stats', value: { stringValue: JSON.stringify(frame.champion_stats) } }
          ]
        }).promise();
      }
    }
  }

  /**
   * Bulk insert timeline events
   * Deletes existing events first to ensure idempotency
   */
  async insertTimelineEvents(matchId: string, events: TimelineEventData[]): Promise<void> {
    // Delete existing events for this match
    await this.rdsData.executeStatement({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql: 'DELETE FROM match_timeline_event WHERE match_id = :match_id',
      parameters: [{ name: 'match_id', value: { stringValue: matchId } }]
    }).promise();

    // Batch insert events
    const batchSize = 50;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      for (const event of batch) {
        const sql = `
          INSERT INTO match_timeline_event (
            match_id, frame_number, timestamp_ms, event_type,
            participant_id, killer_participant_id, victim_participant_id, assisting_participant_ids,
            position_x, position_y,
            building_type, tower_type, lane_type, monster_type, monster_sub_type,
            item_id, skill_slot, ward_type, raw_data
          ) VALUES (
            :match_id, :frame_number, :timestamp_ms, :event_type,
            :participant_id, :killer_participant_id, :victim_participant_id, :assisting_participant_ids,
            :position_x, :position_y,
            :building_type, :tower_type, :lane_type, :monster_type, :monster_sub_type,
            :item_id, :skill_slot, :ward_type, :raw_data
          )
        `;

        await this.rdsData.executeStatement({
          resourceArn: this.resourceArn,
          secretArn: this.secretArn,
          database: this.database,
          sql,
          parameters: [
            { name: 'match_id', value: { stringValue: matchId } },
            { name: 'frame_number', value: { longValue: event.frame_number } },
            { name: 'timestamp_ms', value: { longValue: event.timestamp_ms } },
            { name: 'event_type', value: { stringValue: event.event_type } },
            { name: 'participant_id', value: event.participant_id ? { longValue: event.participant_id } : { isNull: true } },
            { name: 'killer_participant_id', value: event.killer_participant_id ? { longValue: event.killer_participant_id } : { isNull: true } },
            { name: 'victim_participant_id', value: event.victim_participant_id ? { longValue: event.victim_participant_id } : { isNull: true } },
            { name: 'assisting_participant_ids', value: { stringValue: `{${event.assisting_participant_ids.join(',')}}` } },
            { name: 'position_x', value: event.position_x ? { longValue: event.position_x } : { isNull: true } },
            { name: 'position_y', value: event.position_y ? { longValue: event.position_y } : { isNull: true } },
            { name: 'building_type', value: event.building_type ? { stringValue: event.building_type } : { isNull: true } },
            { name: 'tower_type', value: event.tower_type ? { stringValue: event.tower_type } : { isNull: true } },
            { name: 'lane_type', value: event.lane_type ? { stringValue: event.lane_type } : { isNull: true } },
            { name: 'monster_type', value: event.monster_type ? { stringValue: event.monster_type } : { isNull: true } },
            { name: 'monster_sub_type', value: event.monster_sub_type ? { stringValue: event.monster_sub_type } : { isNull: true } },
            { name: 'item_id', value: event.item_id ? { longValue: event.item_id } : { isNull: true } },
            { name: 'skill_slot', value: event.skill_slot ? { longValue: event.skill_slot } : { isNull: true } },
            { name: 'ward_type', value: event.ward_type ? { stringValue: event.ward_type } : { isNull: true } },
            { name: 'raw_data', value: { stringValue: JSON.stringify(event.raw_data) } }
          ]
        }).promise();
      }
    }
  }

  /**
   * Get match ID by external match ID
   */
  async getMatchIdByExternalId(externalMatchId: string): Promise<string | null> {
    const result = await this.rdsData.executeStatement({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql: 'SELECT id FROM match WHERE external_match_id = :external_match_id',
      parameters: [{ name: 'external_match_id', value: { stringValue: externalMatchId } }]
    }).promise();

    return result.records?.[0]?.[0]?.stringValue || null;
  }
}
