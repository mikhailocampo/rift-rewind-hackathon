/**
 * analyticsRepository.ts
 *
 * Handles database operations for SILVER layer analytics data.
 * Uses AWS RDS Data API for serverless Aurora PostgreSQL access.
 *
 * IMPORTANT: This repository uses explicit type casts (::uuid, ::jsonb, ::int[], etc.)
 * to prevent SQL type mismatch errors.
 */

import { RDSDataService } from 'aws-sdk';
import { RdsDataClient } from './rdsDataClient';
import {
  ParticipantAnalyticsData,
  TimelineAnalyticsData,
  RollingAnalyticsData
} from '../types';

export class AnalyticsRepository {
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
   * Upsert participant analytics (idempotent by match_participant_id)
   */
  async upsertParticipantAnalytics(data: ParticipantAnalyticsData): Promise<void> {
    const sql = `
      INSERT INTO match_participant_analytics (
        match_participant_id, match_id, player_profile_id,
        gold_per_minute, cs_per_minute, damage_per_minute,
        gold_advantage_at_10, gold_advantage_at_15, cs_advantage_at_10, xp_advantage_at_15,
        early_laning_gold_exp_advantage, bounty_gold,
        objective_participation_rate, takedowns_after_level_advantage,
        baron_participation, dragon_participation, tower_participation,
        first_turret_contribution, macro_score,
        vision_score_per_minute, control_ward_uptime_percent,
        stealth_wards_placed, wards_cleared, vision_advantage_vs_opponent, roam_efficiency_score,
        deaths_per_minute, unforced_death_rate, kill_participation,
        survival_time_percent, tempo_loss_on_death_avg, wave_management_score,
        economy_score, objectives_score, map_control_score, error_rate_score, overall_performance_score
      ) VALUES (
        :match_participant_id::uuid, :match_id::uuid, :player_profile_id::uuid,
        :gold_per_minute, :cs_per_minute, :damage_per_minute,
        :gold_advantage_at_10, :gold_advantage_at_15, :cs_advantage_at_10, :xp_advantage_at_15,
        :early_laning_gold_exp_advantage, :bounty_gold,
        :objective_participation_rate, :takedowns_after_level_advantage,
        :baron_participation, :dragon_participation, :tower_participation,
        :first_turret_contribution, :macro_score,
        :vision_score_per_minute, :control_ward_uptime_percent,
        :stealth_wards_placed, :wards_cleared, :vision_advantage_vs_opponent, :roam_efficiency_score,
        :deaths_per_minute, :unforced_death_rate, :kill_participation,
        :survival_time_percent, :tempo_loss_on_death_avg, :wave_management_score,
        :economy_score, :objectives_score, :map_control_score, :error_rate_score, :overall_performance_score
      )
      ON CONFLICT (match_participant_id) DO UPDATE SET
        match_id = EXCLUDED.match_id,
        player_profile_id = EXCLUDED.player_profile_id,
        gold_per_minute = EXCLUDED.gold_per_minute,
        cs_per_minute = EXCLUDED.cs_per_minute,
        damage_per_minute = EXCLUDED.damage_per_minute,
        gold_advantage_at_10 = EXCLUDED.gold_advantage_at_10,
        gold_advantage_at_15 = EXCLUDED.gold_advantage_at_15,
        cs_advantage_at_10 = EXCLUDED.cs_advantage_at_10,
        xp_advantage_at_15 = EXCLUDED.xp_advantage_at_15,
        early_laning_gold_exp_advantage = EXCLUDED.early_laning_gold_exp_advantage,
        bounty_gold = EXCLUDED.bounty_gold,
        objective_participation_rate = EXCLUDED.objective_participation_rate,
        takedowns_after_level_advantage = EXCLUDED.takedowns_after_level_advantage,
        baron_participation = EXCLUDED.baron_participation,
        dragon_participation = EXCLUDED.dragon_participation,
        tower_participation = EXCLUDED.tower_participation,
        first_turret_contribution = EXCLUDED.first_turret_contribution,
        macro_score = EXCLUDED.macro_score,
        vision_score_per_minute = EXCLUDED.vision_score_per_minute,
        control_ward_uptime_percent = EXCLUDED.control_ward_uptime_percent,
        stealth_wards_placed = EXCLUDED.stealth_wards_placed,
        wards_cleared = EXCLUDED.wards_cleared,
        vision_advantage_vs_opponent = EXCLUDED.vision_advantage_vs_opponent,
        roam_efficiency_score = EXCLUDED.roam_efficiency_score,
        deaths_per_minute = EXCLUDED.deaths_per_minute,
        unforced_death_rate = EXCLUDED.unforced_death_rate,
        kill_participation = EXCLUDED.kill_participation,
        survival_time_percent = EXCLUDED.survival_time_percent,
        tempo_loss_on_death_avg = EXCLUDED.tempo_loss_on_death_avg,
        wave_management_score = EXCLUDED.wave_management_score,
        economy_score = EXCLUDED.economy_score,
        objectives_score = EXCLUDED.objectives_score,
        map_control_score = EXCLUDED.map_control_score,
        error_rate_score = EXCLUDED.error_rate_score,
        overall_performance_score = EXCLUDED.overall_performance_score,
        computed_at = NOW()
    `;

    const parameters: RDSDataService.SqlParametersList = [
      { name: 'match_participant_id', value: { stringValue: data.match_participant_id } },
      { name: 'match_id', value: { stringValue: data.match_id } },
      this.buildParameter('player_profile_id', data.player_profile_id),
      this.buildParameter('gold_per_minute', data.gold_per_minute),
      this.buildParameter('cs_per_minute', data.cs_per_minute),
      this.buildParameter('damage_per_minute', data.damage_per_minute),
      this.buildParameter('gold_advantage_at_10', data.gold_advantage_at_10),
      this.buildParameter('gold_advantage_at_15', data.gold_advantage_at_15),
      this.buildParameter('cs_advantage_at_10', data.cs_advantage_at_10),
      this.buildParameter('xp_advantage_at_15', data.xp_advantage_at_15),
      this.buildParameter('early_laning_gold_exp_advantage', data.early_laning_gold_exp_advantage),
      this.buildParameter('bounty_gold', data.bounty_gold),
      this.buildParameter('objective_participation_rate', data.objective_participation_rate),
      this.buildParameter('takedowns_after_level_advantage', data.takedowns_after_level_advantage),
      this.buildParameter('baron_participation', data.baron_participation),
      this.buildParameter('dragon_participation', data.dragon_participation),
      this.buildParameter('tower_participation', data.tower_participation),
      this.buildParameter('first_turret_contribution', data.first_turret_contribution),
      this.buildParameter('macro_score', data.macro_score),
      this.buildParameter('vision_score_per_minute', data.vision_score_per_minute),
      this.buildParameter('control_ward_uptime_percent', data.control_ward_uptime_percent),
      this.buildParameter('stealth_wards_placed', data.stealth_wards_placed),
      this.buildParameter('wards_cleared', data.wards_cleared),
      this.buildParameter('vision_advantage_vs_opponent', data.vision_advantage_vs_opponent),
      this.buildParameter('roam_efficiency_score', data.roam_efficiency_score),
      this.buildParameter('deaths_per_minute', data.deaths_per_minute),
      this.buildParameter('unforced_death_rate', data.unforced_death_rate),
      this.buildParameter('kill_participation', data.kill_participation),
      this.buildParameter('survival_time_percent', data.survival_time_percent),
      this.buildParameter('tempo_loss_on_death_avg', data.tempo_loss_on_death_avg),
      this.buildParameter('wave_management_score', data.wave_management_score),
      this.buildParameter('economy_score', data.economy_score),
      this.buildParameter('objectives_score', data.objectives_score),
      this.buildParameter('map_control_score', data.map_control_score),
      this.buildParameter('error_rate_score', data.error_rate_score),
      this.buildParameter('overall_performance_score', data.overall_performance_score)
    ];

    await this.rdsClient.executeStatement(sql, parameters);
  }

  /**
   * Upsert timeline analytics (idempotent by match_id)
   */
  async upsertTimelineAnalytics(data: TimelineAnalyticsData): Promise<void> {
    const sql = `
      INSERT INTO match_timeline_analytics (
        match_id,
        first_blood_timestamp_ms, first_blood_team_id, first_blood_killer_participant_id,
        first_tower_timestamp_ms, first_tower_team_id,
        first_dragon_timestamp_ms, first_dragon_team_id,
        first_baron_timestamp_ms, first_baron_team_id,
        avg_players_near_dragon_kills, avg_players_near_baron_kills, objective_steals_count,
        gold_swing_events, ace_timestamps
      ) VALUES (
        :match_id::uuid,
        :first_blood_timestamp_ms, :first_blood_team_id, :first_blood_killer_participant_id,
        :first_tower_timestamp_ms, :first_tower_team_id,
        :first_dragon_timestamp_ms, :first_dragon_team_id,
        :first_baron_timestamp_ms, :first_baron_team_id,
        :avg_players_near_dragon_kills, :avg_players_near_baron_kills, :objective_steals_count,
        :gold_swing_events::jsonb, :ace_timestamps::bigint[]
      )
      ON CONFLICT (match_id) DO UPDATE SET
        first_blood_timestamp_ms = EXCLUDED.first_blood_timestamp_ms,
        first_blood_team_id = EXCLUDED.first_blood_team_id,
        first_blood_killer_participant_id = EXCLUDED.first_blood_killer_participant_id,
        first_tower_timestamp_ms = EXCLUDED.first_tower_timestamp_ms,
        first_tower_team_id = EXCLUDED.first_tower_team_id,
        first_dragon_timestamp_ms = EXCLUDED.first_dragon_timestamp_ms,
        first_dragon_team_id = EXCLUDED.first_dragon_team_id,
        first_baron_timestamp_ms = EXCLUDED.first_baron_timestamp_ms,
        first_baron_team_id = EXCLUDED.first_baron_team_id,
        avg_players_near_dragon_kills = EXCLUDED.avg_players_near_dragon_kills,
        avg_players_near_baron_kills = EXCLUDED.avg_players_near_baron_kills,
        objective_steals_count = EXCLUDED.objective_steals_count,
        gold_swing_events = EXCLUDED.gold_swing_events,
        ace_timestamps = EXCLUDED.ace_timestamps,
        computed_at = NOW()
    `;

    const parameters: RDSDataService.SqlParametersList = [
      { name: 'match_id', value: { stringValue: data.match_id } },
      this.buildParameter('first_blood_timestamp_ms', data.first_blood_timestamp_ms),
      this.buildParameter('first_blood_team_id', data.first_blood_team_id),
      this.buildParameter('first_blood_killer_participant_id', data.first_blood_killer_participant_id),
      this.buildParameter('first_tower_timestamp_ms', data.first_tower_timestamp_ms),
      this.buildParameter('first_tower_team_id', data.first_tower_team_id),
      this.buildParameter('first_dragon_timestamp_ms', data.first_dragon_timestamp_ms),
      this.buildParameter('first_dragon_team_id', data.first_dragon_team_id),
      this.buildParameter('first_baron_timestamp_ms', data.first_baron_timestamp_ms),
      this.buildParameter('first_baron_team_id', data.first_baron_team_id),
      this.buildParameter('avg_players_near_dragon_kills', data.avg_players_near_dragon_kills),
      this.buildParameter('avg_players_near_baron_kills', data.avg_players_near_baron_kills),
      this.buildParameter('objective_steals_count', data.objective_steals_count),
      this.buildJsonbParameter('gold_swing_events', data.gold_swing_events),
      this.buildBigIntArrayParameter('ace_timestamps', data.ace_timestamps)
    ];

    await this.rdsClient.executeStatement(sql, parameters);
  }

  /**
   * Upsert rolling analytics (idempotent by unique constraint)
   */
  async upsertRollingAnalytics(data: RollingAnalyticsData): Promise<void> {
    const sql = `
      INSERT INTO player_rolling_analytics (
        player_profile_id, match_count, champion_id, queue_id, team_position,
        avg_economy_score, avg_objectives_score, avg_map_control_score, avg_error_rate_score, avg_overall_performance,
        win_rate, total_matches,
        economy_trend, objectives_trend, map_control_trend, error_rate_trend,
        match_ids
      ) VALUES (
        :player_profile_id::uuid, :match_count, :champion_id, :queue_id, :team_position,
        :avg_economy_score, :avg_objectives_score, :avg_map_control_score, :avg_error_rate_score, :avg_overall_performance,
        :win_rate, :total_matches,
        :economy_trend, :objectives_trend, :map_control_trend, :error_rate_trend,
        :match_ids::uuid[]
      )
      ON CONFLICT (player_profile_id, match_count, COALESCE(champion_id, -1), COALESCE(queue_id, -1), COALESCE(team_position, ''))
      DO UPDATE SET
        avg_economy_score = EXCLUDED.avg_economy_score,
        avg_objectives_score = EXCLUDED.avg_objectives_score,
        avg_map_control_score = EXCLUDED.avg_map_control_score,
        avg_error_rate_score = EXCLUDED.avg_error_rate_score,
        avg_overall_performance = EXCLUDED.avg_overall_performance,
        win_rate = EXCLUDED.win_rate,
        total_matches = EXCLUDED.total_matches,
        economy_trend = EXCLUDED.economy_trend,
        objectives_trend = EXCLUDED.objectives_trend,
        map_control_trend = EXCLUDED.map_control_trend,
        error_rate_trend = EXCLUDED.error_rate_trend,
        match_ids = EXCLUDED.match_ids,
        computed_at = NOW()
    `;

    const parameters: RDSDataService.SqlParametersList = [
      { name: 'player_profile_id', value: { stringValue: data.player_profile_id } },
      { name: 'match_count', value: { longValue: data.match_count } },
      this.buildParameter('champion_id', data.champion_id),
      this.buildParameter('queue_id', data.queue_id),
      this.buildParameter('team_position', data.team_position),
      this.buildParameter('avg_economy_score', data.avg_economy_score),
      this.buildParameter('avg_objectives_score', data.avg_objectives_score),
      this.buildParameter('avg_map_control_score', data.avg_map_control_score),
      this.buildParameter('avg_error_rate_score', data.avg_error_rate_score),
      this.buildParameter('avg_overall_performance', data.avg_overall_performance),
      this.buildParameter('win_rate', data.win_rate),
      { name: 'total_matches', value: { longValue: data.total_matches } },
      this.buildParameter('economy_trend', data.economy_trend),
      this.buildParameter('objectives_trend', data.objectives_trend),
      this.buildParameter('map_control_trend', data.map_control_trend),
      this.buildParameter('error_rate_trend', data.error_rate_trend),
      this.buildUuidArrayParameter('match_ids', data.match_ids)
    ];

    await this.rdsClient.executeStatement(sql, parameters);
  }

  /**
   * Helper: Build parameter with NULL handling
   */
  private buildParameter(name: string, value: any): RDSDataService.SqlParameter {
    if (value === null || value === undefined) {
      return { name, value: { isNull: true } };
    }

    if (typeof value === 'number') {
      // Use doubleValue for DECIMAL types, longValue for INT types
      // RDS Data API will handle the conversion based on column type
      return { name, value: { doubleValue: value } };
    }

    if (typeof value === 'boolean') {
      return { name, value: { booleanValue: value } };
    }

    if (typeof value === 'string') {
      return { name, value: { stringValue: value } };
    }

    return { name, value: { isNull: true } };
  }

  /**
   * Helper: Build JSONB parameter (for objects/arrays)
   */
  private buildJsonbParameter(name: string, value: any): RDSDataService.SqlParameter {
    if (value === null || value === undefined) {
      return { name, value: { isNull: true } };
    }

    return { name, value: { stringValue: JSON.stringify(value) } };
  }

  /**
   * Helper: Build bigint[] parameter
   */
  private buildBigIntArrayParameter(name: string, value: number[] | null): RDSDataService.SqlParameter {
    if (value === null || value === undefined || value.length === 0) {
      return { name, value: { isNull: true } };
    }

    // PostgreSQL array literal: {val1,val2,val3}
    const arrayLiteral = `{${value.join(',')}}`;
    return { name, value: { stringValue: arrayLiteral } };
  }

  /**
   * Helper: Build uuid[] parameter
   */
  private buildUuidArrayParameter(name: string, value: string[] | null): RDSDataService.SqlParameter {
    if (value === null || value === undefined || value.length === 0) {
      return { name, value: { isNull: true } };
    }

    // PostgreSQL array literal: {uuid1,uuid2,uuid3}
    const arrayLiteral = `{${value.join(',')}}`;
    return { name, value: { stringValue: arrayLiteral } };
  }
}
