/**
 * matchRepository.ts
 *
 * Handles database operations for BRONZE layer match data.
 * Uses AWS RDS Data API for serverless Aurora PostgreSQL access.
 */

import { RDSDataService } from 'aws-sdk';
import { RdsDataClient } from './rdsDataClient';
import {
  MatchData,
  MatchParticipantData,
  MatchTeamData,
  TimelineFrameData,
  TimelineEventData
} from '../builders/matchDataBuilder';

export class MatchRepository {
  private rdsData: RDSDataService;
  private rdsClient: RdsDataClient;
  private resourceArn: string;
  private secretArn: string;
  private database: string;

  constructor() {
    this.rdsData = new RDSDataService();
    this.rdsClient = new RdsDataClient();
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
        :game_version, :duration_seconds, :started_at::timestamptz, :ended_at::timestamptz, :winning_team_id, :payload::jsonb
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
    await this.rdsClient.executeStatement(
      'DELETE FROM match_participant WHERE match_id = :match_id::uuid',
      [{ name: 'match_id', value: { stringValue: matchId } }]
    );

    if (participants.length === 0) {
      return;
    }

    // Prepare rows for batch insert
    const rows = participants.map(p => ({
      match_id: matchId,
      participant_id: p.participant_id,
      puuid: p.puuid,
      team_id: p.team_id,
      champion_id: p.champion_id,
      champion_name: p.champion_name,
      team_position: p.team_position || '',
      individual_position: p.individual_position || '',
      summoner_spells: p.summoner_spells,
      items: p.items,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      gold_earned: p.gold_earned,
      total_damage_to_champions: p.total_damage_to_champions,
      cs_total: p.cs_total,
      champ_level: p.champ_level,
      vision_score: p.vision_score,
      win: p.win,
      primary_rune_style: p.primary_rune_style,
      sub_rune_style: p.sub_rune_style,
      stat_perks: p.stat_perks,
      challenges: p.challenges,
      raw_data: p.raw_data
    }));

    const columns = [
      'match_id', 'participant_id', 'puuid', 'team_id', 'champion_id', 'champion_name',
      'team_position', 'individual_position', 'summoner_spells', 'items',
      'kills', 'deaths', 'assists', 'gold_earned', 'total_damage_to_champions',
      'cs_total', 'champ_level', 'vision_score', 'win',
      'primary_rune_style', 'sub_rune_style', 'stat_perks', 'challenges', 'raw_data'
    ];

    const typeMappers = {
      match_id: RdsDataClient.typeMappers.uuid,
      participant_id: RdsDataClient.typeMappers.number,
      puuid: RdsDataClient.typeMappers.string,
      team_id: RdsDataClient.typeMappers.number,
      champion_id: RdsDataClient.typeMappers.number,
      champion_name: RdsDataClient.typeMappers.string,
      team_position: RdsDataClient.typeMappers.string,
      individual_position: RdsDataClient.typeMappers.string,
      summoner_spells: RdsDataClient.typeMappers.intArray,
      items: RdsDataClient.typeMappers.intArray,
      kills: RdsDataClient.typeMappers.number,
      deaths: RdsDataClient.typeMappers.number,
      assists: RdsDataClient.typeMappers.number,
      gold_earned: RdsDataClient.typeMappers.number,
      total_damage_to_champions: RdsDataClient.typeMappers.number,
      cs_total: RdsDataClient.typeMappers.number,
      champ_level: RdsDataClient.typeMappers.number,
      vision_score: RdsDataClient.typeMappers.number,
      win: RdsDataClient.typeMappers.boolean,
      primary_rune_style: RdsDataClient.typeMappers.number,
      sub_rune_style: RdsDataClient.typeMappers.number,
      stat_perks: RdsDataClient.typeMappers.json,
      challenges: RdsDataClient.typeMappers.json,
      raw_data: RdsDataClient.typeMappers.json
    };

    // Batch insert with custom SQL to handle type casts
    const sql = this.rdsClient.buildBatchInsertSQL('match_participant', columns, rows.length);
    const sqlWithCasts = sql.replace(
      `INSERT INTO match_participant (${columns.join(', ')})`,
      `INSERT INTO match_participant (${columns.join(', ')})`
    ).replace(/VALUES (.+)$/, (match, values) => {
      // Add type casts for special columns
      const castedValues = values.replace(
        /\(:row(\d+)_match_id,/g, '(:row$1_match_id::uuid,'
      ).replace(
        /,\s*:row(\d+)_summoner_spells,/g, ', :row$1_summoner_spells::int[],'
      ).replace(
        /,\s*:row(\d+)_items,/g, ', :row$1_items::int[],'
      ).replace(
        /,\s*:row(\d+)_stat_perks,/g, ', :row$1_stat_perks::jsonb,'
      ).replace(
        /,\s*:row(\d+)_challenges,/g, ', :row$1_challenges::jsonb,'
      ).replace(
        /,\s*:row(\d+)_raw_data\)/g, ', :row$1_raw_data::jsonb)'
      );
      return `VALUES ${castedValues}`;
    });

    const parameters = this.rdsClient.buildBatchParameters(columns, rows, typeMappers);
    await this.rdsClient.executeStatement(sqlWithCasts, parameters);
  }

  /**
   * Insert teams for a match
   * Deletes existing teams first to ensure idempotency
   */
  async insertTeams(matchId: string, teams: MatchTeamData[]): Promise<void> {
    // First, delete existing teams for this match
    await this.rdsClient.executeStatement(
      'DELETE FROM match_team WHERE match_id = :match_id::uuid',
      [{ name: 'match_id', value: { stringValue: matchId } }]
    );

    if (teams.length === 0) {
      return;
    }

    // Prepare rows for batch insert
    const rows = teams.map(t => ({
      match_id: matchId,
      team_id: t.team_id,
      win: t.win,
      barons: t.barons,
      dragons: t.dragons,
      towers: t.towers,
      inhibitors: t.inhibitors,
      rift_heralds: t.rift_heralds,
      bans: t.bans,
      raw_data: t.raw_data
    }));

    const columns = [
      'match_id', 'team_id', 'win', 'barons', 'dragons', 'towers', 'inhibitors', 'rift_heralds', 'bans', 'raw_data'
    ];

    const typeMappers = {
      match_id: RdsDataClient.typeMappers.uuid,
      team_id: RdsDataClient.typeMappers.number,
      win: RdsDataClient.typeMappers.boolean,
      barons: RdsDataClient.typeMappers.number,
      dragons: RdsDataClient.typeMappers.number,
      towers: RdsDataClient.typeMappers.number,
      inhibitors: RdsDataClient.typeMappers.number,
      rift_heralds: RdsDataClient.typeMappers.number,
      bans: RdsDataClient.typeMappers.intArray,
      raw_data: RdsDataClient.typeMappers.json
    };

    // Batch insert with custom SQL to handle type casts
    const sql = this.rdsClient.buildBatchInsertSQL('match_team', columns, rows.length);
    const sqlWithCasts = sql.replace(/VALUES (.+)$/, (match, values) => {
      // Add type casts for special columns
      const castedValues = values.replace(
        /\(:row(\d+)_match_id,/g, '(:row$1_match_id::uuid,'
      ).replace(
        /,\s*:row(\d+)_bans,/g, ', :row$1_bans::int[],'
      ).replace(
        /,\s*:row(\d+)_raw_data\)/g, ', :row$1_raw_data::jsonb)'
      );
      return `VALUES ${castedValues}`;
    });

    const parameters = this.rdsClient.buildBatchParameters(columns, rows, typeMappers);
    await this.rdsClient.executeStatement(sqlWithCasts, parameters);
  }

  /**
   * Bulk insert timeline frames
   * Deletes existing frames first to ensure idempotency
   */
  async insertTimelineFrames(matchId: string, frames: TimelineFrameData[]): Promise<void> {
    // Delete existing frames for this match
    await this.rdsClient.executeStatement(
      'DELETE FROM match_timeline_frame WHERE match_id = :match_id::uuid',
      [{ name: 'match_id', value: { stringValue: matchId } }]
    );

    if (frames.length === 0) {
      return;
    }

    // Prepare rows for batch insert
    const rows = frames.map(f => ({
      match_id: matchId,
      frame_number: f.frame_number,
      timestamp_ms: f.timestamp_ms,
      participant_id: f.participant_id,
      total_gold: f.total_gold,
      current_gold: f.current_gold,
      gold_per_second: f.gold_per_second,
      xp: f.xp,
      level: f.level,
      position_x: f.position_x,
      position_y: f.position_y,
      champion_stats: f.champion_stats
    }));

    const columns = [
      'match_id', 'frame_number', 'timestamp_ms', 'participant_id',
      'total_gold', 'current_gold', 'gold_per_second', 'xp', 'level',
      'position_x', 'position_y', 'champion_stats'
    ];

    const typeMappers = {
      match_id: RdsDataClient.typeMappers.uuid,
      frame_number: RdsDataClient.typeMappers.number,
      timestamp_ms: RdsDataClient.typeMappers.number,
      participant_id: RdsDataClient.typeMappers.number,
      total_gold: RdsDataClient.typeMappers.number,
      current_gold: RdsDataClient.typeMappers.number,
      gold_per_second: RdsDataClient.typeMappers.number,
      xp: RdsDataClient.typeMappers.number,
      level: RdsDataClient.typeMappers.number,
      position_x: RdsDataClient.typeMappers.number,
      position_y: RdsDataClient.typeMappers.number,
      champion_stats: RdsDataClient.typeMappers.json
    };

    // Batch insert frames in chunks of 50 to avoid parameter limits
    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      const sql = this.rdsClient.buildBatchInsertSQL('match_timeline_frame', columns, batch.length);
      const sqlWithCasts = sql.replace(/VALUES (.+)$/, (match, values) => {
        // Add type casts for special columns
        const castedValues = values.replace(
          /\(:row(\d+)_match_id,/g, '(:row$1_match_id::uuid,'
        ).replace(
          /,\s*:row(\d+)_champion_stats\)/g, ', :row$1_champion_stats::jsonb)'
        );
        return `VALUES ${castedValues}`;
      });

      const parameters = this.rdsClient.buildBatchParameters(columns, batch, typeMappers);
      await this.rdsClient.executeStatement(sqlWithCasts, parameters);
    }
  }

  /**
   * Bulk insert timeline events
   * Deletes existing events first to ensure idempotency
   */
  async insertTimelineEvents(matchId: string, events: TimelineEventData[]): Promise<void> {
    // Delete existing events for this match
    await this.rdsClient.executeStatement(
      'DELETE FROM match_timeline_event WHERE match_id = :match_id::uuid',
      [{ name: 'match_id', value: { stringValue: matchId } }]
    );

    if (events.length === 0) {
      return;
    }

    // Prepare rows for batch insert
    const rows = events.map(e => ({
      match_id: matchId,
      frame_number: e.frame_number,
      timestamp_ms: e.timestamp_ms,
      event_type: e.event_type,
      participant_id: e.participant_id,
      killer_participant_id: e.killer_participant_id,
      victim_participant_id: e.victim_participant_id,
      assisting_participant_ids: e.assisting_participant_ids,
      position_x: e.position_x,
      position_y: e.position_y,
      building_type: e.building_type,
      tower_type: e.tower_type,
      lane_type: e.lane_type,
      monster_type: e.monster_type,
      monster_sub_type: e.monster_sub_type,
      item_id: e.item_id,
      skill_slot: e.skill_slot,
      ward_type: e.ward_type,
      raw_data: e.raw_data
    }));

    const columns = [
      'match_id', 'frame_number', 'timestamp_ms', 'event_type',
      'participant_id', 'killer_participant_id', 'victim_participant_id', 'assisting_participant_ids',
      'position_x', 'position_y',
      'building_type', 'tower_type', 'lane_type', 'monster_type', 'monster_sub_type',
      'item_id', 'skill_slot', 'ward_type', 'raw_data'
    ];

    const typeMappers = {
      match_id: RdsDataClient.typeMappers.uuid,
      frame_number: RdsDataClient.typeMappers.number,
      timestamp_ms: RdsDataClient.typeMappers.number,
      event_type: RdsDataClient.typeMappers.string,
      participant_id: RdsDataClient.typeMappers.number,
      killer_participant_id: RdsDataClient.typeMappers.number,
      victim_participant_id: RdsDataClient.typeMappers.number,
      assisting_participant_ids: RdsDataClient.typeMappers.intArray,
      position_x: RdsDataClient.typeMappers.number,
      position_y: RdsDataClient.typeMappers.number,
      building_type: RdsDataClient.typeMappers.string,
      tower_type: RdsDataClient.typeMappers.string,
      lane_type: RdsDataClient.typeMappers.string,
      monster_type: RdsDataClient.typeMappers.string,
      monster_sub_type: RdsDataClient.typeMappers.string,
      item_id: RdsDataClient.typeMappers.number,
      skill_slot: RdsDataClient.typeMappers.number,
      ward_type: RdsDataClient.typeMappers.string,
      raw_data: RdsDataClient.typeMappers.json
    };

    // Batch insert events in chunks of 50 to avoid parameter limits
    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      const sql = this.rdsClient.buildBatchInsertSQL('match_timeline_event', columns, batch.length);
      const sqlWithCasts = sql.replace(/VALUES (.+)$/, (match, values) => {
        // Add type casts for special columns
        const castedValues = values.replace(
          /\(:row(\d+)_match_id,/g, '(:row$1_match_id::uuid,'
        ).replace(
          /,\s*:row(\d+)_assisting_participant_ids,/g, ', :row$1_assisting_participant_ids::int[],'
        ).replace(
          /,\s*:row(\d+)_raw_data\)/g, ', :row$1_raw_data::jsonb)'
        );
        return `VALUES ${castedValues}`;
      });

      const parameters = this.rdsClient.buildBatchParameters(columns, batch, typeMappers);
      await this.rdsClient.executeStatement(sqlWithCasts, parameters);
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
