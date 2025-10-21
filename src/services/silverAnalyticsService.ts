/**
 * silverAnalyticsService.ts
 *
 * Orchestrates BRONZE→SILVER transformations
 * Computes analytics metrics from raw match data:
 * - Participant analytics (4-factor model)
 * - Timeline analytics (first blood, objectives)
 * - Rolling analytics (multi-match aggregates)
 */

import { AnalyticsRepository } from '../database/analyticsRepository';
import { RdsDataClient } from '../database/rdsDataClient';
import {
  ParticipantAnalyticsData,
  TimelineAnalyticsData,
  RollingAnalyticsData
} from '../types';

export class SilverAnalyticsService {
  private analyticsRepo: AnalyticsRepository;
  private rdsClient: RdsDataClient;
  private resourceArn: string;
  private secretArn: string;
  private database: string;

  constructor() {
    this.analyticsRepo = new AnalyticsRepository();
    this.rdsClient = new RdsDataClient();
    this.resourceArn = process.env.RDS_CLUSTER_ARN!;
    this.secretArn = process.env.RDS_SECRET_ARN!;
    this.database = process.env.DATABASE_NAME || 'postgres';
  }

  /**
   * Compute participant analytics for all participants in a match
   */
  async computeParticipantAnalytics(matchId: string): Promise<void> {
    console.log(`Computing participant analytics for match ${matchId}`);

    // Fetch all participants with match duration
    const participantsQuery = `
      SELECT
        mp.id as participant_id,
        mp.match_id,
        mp.player_profile_id,
        mp.participant_id as in_game_participant_id,
        mp.team_id,
        mp.gold_earned,
        mp.cs_total,
        mp.total_damage_to_champions,
        mp.kills,
        mp.deaths,
        mp.assists,
        mp.vision_score,
        mp.win,
        mp.challenges,
        m.duration_seconds,
        m.winning_team_id
      FROM match_participant mp
      JOIN match m ON m.id = mp.match_id
      WHERE mp.match_id = :match_id::uuid
    `;

    const participants = await this.rdsClient.executeStatement(participantsQuery, [
      { name: 'match_id', value: { stringValue: matchId } }
    ]);

    if (!participants.records || participants.records.length === 0) {
      console.warn(`No participants found for match ${matchId}`);
      return;
    }

    // Process each participant
    for (const participantRow of participants.records) {
      const participantId = participantRow[0].stringValue!;
      const playerProfileId = participantRow[2].stringValue || null;
      const inGameParticipantId = Number(participantRow[3].longValue);
      const teamId = Number(participantRow[4].longValue);
      const goldEarned = Number(participantRow[5].longValue);
      const csTotal = Number(participantRow[6].longValue);
      const totalDamage = Number(participantRow[7].longValue);
      const kills = Number(participantRow[8].longValue);
      const deaths = Number(participantRow[9].longValue);
      const assists = Number(participantRow[10].longValue);
      const visionScore = Number(participantRow[11].longValue);
      const win = participantRow[12].booleanValue!;
      const challengesJson = participantRow[13].stringValue;
      const durationSeconds = Number(participantRow[14].longValue);
      const winningTeamId = Number(participantRow[15].longValue);

      const challenges = challengesJson ? JSON.parse(challengesJson) : {};
      const durationMinutes = durationSeconds / 60;

      // Compute economy metrics
      const economyMetrics = this.computeEconomyMetrics({
        goldEarned,
        csTotal,
        totalDamage,
        durationMinutes,
        challenges
      });

      // Compute objectives metrics
      const objectivesMetrics = await this.computeObjectivesMetrics({
        matchId,
        inGameParticipantId,
        teamId,
        challenges
      });

      // Compute map control metrics
      const mapControlMetrics = this.computeMapControlMetrics({
        visionScore,
        durationMinutes,
        challenges
      });

      // Compute error rate metrics
      const errorMetrics = await this.computeErrorMetrics({
        matchId,
        inGameParticipantId,
        kills,
        deaths,
        assists,
        durationMinutes
      });

      // Compute composite scores (0-100 normalized)
      const economyScore = this.normalizeEconomyScore(economyMetrics);
      const objectivesScore = this.normalizeObjectivesScore(objectivesMetrics);
      const mapControlScore = this.normalizeMapControlScore(mapControlMetrics);
      const errorRateScore = this.normalizeErrorScore(errorMetrics);

      // Overall performance (weighted average)
      const overallScore = this.computeOverallScore({
        economyScore,
        objectivesScore,
        mapControlScore,
        errorRateScore
      });

      // Build analytics data
      const analyticsData: ParticipantAnalyticsData = {
        match_participant_id: participantId,
        match_id: matchId,
        player_profile_id: playerProfileId,
        ...economyMetrics,
        ...objectivesMetrics,
        ...mapControlMetrics,
        ...errorMetrics,
        economy_score: economyScore,
        objectives_score: objectivesScore,
        map_control_score: mapControlScore,
        error_rate_score: errorRateScore,
        overall_performance_score: overallScore
      };

      await this.analyticsRepo.upsertParticipantAnalytics(analyticsData);
    }

    console.log(`Computed analytics for ${participants.records.length} participants`);
  }

  /**
   * Compute economy metrics
   */
  private computeEconomyMetrics(params: {
    goldEarned: number;
    csTotal: number;
    totalDamage: number;
    durationMinutes: number;
    challenges: any;
  }): Partial<ParticipantAnalyticsData> {
    const { goldEarned, csTotal, totalDamage, durationMinutes, challenges } = params;

    return {
      gold_per_minute: goldEarned / durationMinutes,
      cs_per_minute: csTotal / durationMinutes,
      damage_per_minute: totalDamage / durationMinutes,
      gold_advantage_at_10: null, // TODO: Compute from timeline frames
      gold_advantage_at_15: null,
      cs_advantage_at_10: null,
      xp_advantage_at_15: null,
      early_laning_gold_exp_advantage: challenges?.earlyLaningPhaseGoldExpAdvantage || null,
      bounty_gold: challenges?.bountyGold || null
    };
  }

  /**
   * Compute objectives metrics from timeline events
   */
  private async computeObjectivesMetrics(params: {
    matchId: string;
    inGameParticipantId: number;
    teamId: number;
    challenges: any;
  }): Promise<Partial<ParticipantAnalyticsData>> {
    const { matchId, inGameParticipantId, teamId, challenges } = params;

    // Count baron participation
    const baronQuery = `
      SELECT COUNT(*)
      FROM match_timeline_event
      WHERE match_id = :match_id::uuid
        AND event_type = 'ELITE_MONSTER_KILL'
        AND monster_type = 'BARON_NASHOR'
        AND (
          killer_participant_id = :participant_id
          OR :participant_id = ANY(assisting_participant_ids)
        )
    `;

    const baronResult = await this.rdsClient.executeStatement(baronQuery, [
      { name: 'match_id', value: { stringValue: matchId } },
      { name: 'participant_id', value: { longValue: inGameParticipantId } }
    ]);
    const baronParticipation = Number(baronResult.records?.[0]?.[0]?.longValue || 0);

    // Count dragon participation
    const dragonQuery = `
      SELECT COUNT(*)
      FROM match_timeline_event
      WHERE match_id = :match_id::uuid
        AND event_type = 'ELITE_MONSTER_KILL'
        AND monster_type = 'DRAGON'
        AND (
          killer_participant_id = :participant_id
          OR :participant_id = ANY(assisting_participant_ids)
        )
    `;

    const dragonResult = await this.rdsClient.executeStatement(dragonQuery, [
      { name: 'match_id', value: { stringValue: matchId } },
      { name: 'participant_id', value: { longValue: inGameParticipantId } }
    ]);
    const dragonParticipation = Number(dragonResult.records?.[0]?.[0]?.longValue || 0);

    // Count tower participation
    const towerQuery = `
      SELECT COUNT(*)
      FROM match_timeline_event
      WHERE match_id = :match_id::uuid
        AND event_type = 'BUILDING_KILL'
        AND building_type = 'TOWER_BUILDING'
        AND (
          killer_participant_id = :participant_id
          OR :participant_id = ANY(assisting_participant_ids)
        )
    `;

    const towerResult = await this.rdsClient.executeStatement(towerQuery, [
      { name: 'match_id', value: { stringValue: matchId } },
      { name: 'participant_id', value: { longValue: inGameParticipantId } }
    ]);
    const towerParticipation = Number(towerResult.records?.[0]?.[0]?.longValue || 0);

    // Calculate objective participation rate
    const totalParticipation = baronParticipation + dragonParticipation + towerParticipation;
    let objectiveParticipationRate = null;

    if (totalParticipation > 0) {
      // Get team's total objectives
      const teamObjectivesQuery = `
        SELECT
          COALESCE(barons, 0) + COALESCE(dragons, 0) + COALESCE(towers, 0) as total
        FROM match_team
        WHERE match_id = :match_id::uuid AND team_id = :team_id
      `;

      const teamObjResult = await this.rdsClient.executeStatement(teamObjectivesQuery, [
        { name: 'match_id', value: { stringValue: matchId } },
        { name: 'team_id', value: { longValue: teamId } }
      ]);

      const teamTotal = Number(teamObjResult.records?.[0]?.[0]?.longValue || 0);
      if (teamTotal > 0) {
        objectiveParticipationRate = (totalParticipation / teamTotal) * 100;
      }
    }

    return {
      objective_participation_rate: objectiveParticipationRate,
      takedowns_after_level_advantage: challenges?.takedownsAfterGainingLevelAdvantage || null,
      baron_participation: baronParticipation,
      dragon_participation: dragonParticipation,
      tower_participation: towerParticipation,
      first_turret_contribution: null, // TODO: Check if participated in first turret
      macro_score: null // Computed from normalization
    };
  }

  /**
   * Compute map control metrics
   */
  private computeMapControlMetrics(params: {
    visionScore: number;
    durationMinutes: number;
    challenges: any;
  }): Partial<ParticipantAnalyticsData> {
    const { visionScore, durationMinutes, challenges } = params;

    return {
      vision_score_per_minute: visionScore / durationMinutes,
      control_ward_uptime_percent: challenges?.controlWardTimeCoverageInRiver
        ? challenges.controlWardTimeCoverageInRiver * 100
        : null,
      stealth_wards_placed: challenges?.stealthWardsPlaced || null,
      wards_cleared: challenges?.wardsGuarded || null,
      vision_advantage_vs_opponent: challenges?.visionScoreAdvantageLaneOpponent || null,
      roam_efficiency_score: null // TODO: Compute from timeline position data
    };
  }

  /**
   * Compute error rate metrics
   */
  private async computeErrorMetrics(params: {
    matchId: string;
    inGameParticipantId: number;
    kills: number;
    deaths: number;
    assists: number;
    durationMinutes: number;
  }): Promise<Partial<ParticipantAnalyticsData>> {
    const { matchId, inGameParticipantId, kills, deaths, assists, durationMinutes } = params;

    // Get team's total kills for kill participation
    const teamKillsQuery = `
      SELECT SUM(mp.kills) as team_kills
      FROM match_participant mp
      JOIN match m ON m.id = mp.match_id
      WHERE mp.match_id = :match_id::uuid
        AND mp.team_id = (
          SELECT team_id FROM match_participant
          WHERE match_id = :match_id::uuid AND participant_id = :participant_id
        )
    `;

    const teamKillsResult = await this.rdsClient.executeStatement(teamKillsQuery, [
      { name: 'match_id', value: { stringValue: matchId } },
      { name: 'participant_id', value: { longValue: inGameParticipantId } }
    ]);

    const teamKills = Number(teamKillsResult.records?.[0]?.[0]?.longValue || 0);
    const killParticipation = teamKills > 0 ? ((kills + assists) / teamKills) * 100 : null;

    return {
      deaths_per_minute: deaths / durationMinutes,
      unforced_death_rate: null, // TODO: Analyze timeline for solo deaths
      kill_participation: killParticipation,
      survival_time_percent: null, // TODO: Compute from timeline
      tempo_loss_on_death_avg: null, // TODO: Compute gold/XP lost per death
      wave_management_score: null // TODO: Compute from CS efficiency
    };
  }

  /**
   * Normalize economy score to 0-100
   */
  private normalizeEconomyScore(metrics: Partial<ParticipantAnalyticsData>): number | null {
    if (!metrics.gold_per_minute) return null;

    // Normalize based on typical ranges
    // Average: 400 GPM, Good: 500 GPM, Excellent: 600+ GPM
    const gpmScore = Math.min(100, Math.max(0, ((metrics.gold_per_minute - 300) / 300) * 100));

    return Math.round(gpmScore * 10) / 10; // Round to 1 decimal
  }

  /**
   * Normalize objectives score to 0-100
   */
  private normalizeObjectivesScore(metrics: Partial<ParticipantAnalyticsData>): number | null {
    if (metrics.objective_participation_rate === null) return null;

    // Direct mapping since it's already a percentage
    return Math.round(metrics.objective_participation_rate * 10) / 10;
  }

  /**
   * Normalize map control score to 0-100
   */
  private normalizeMapControlScore(metrics: Partial<ParticipantAnalyticsData>): number | null {
    if (!metrics.vision_score_per_minute) return null;

    // Average: 1.0 VSPM, Good: 1.5 VSPM, Excellent: 2.0+ VSPM
    const vspmScore = Math.min(100, Math.max(0, (metrics.vision_score_per_minute / 2.0) * 100));

    return Math.round(vspmScore * 10) / 10;
  }

  /**
   * Normalize error score to 0-100 (inverted - lower errors = higher score)
   */
  private normalizeErrorScore(metrics: Partial<ParticipantAnalyticsData>): number | null {
    if (metrics.deaths_per_minute === null) return null;

    // Average: 0.2 DPM, Good: 0.1 DPM, Excellent: 0.05 DPM
    // Invert so lower deaths = higher score
    const deathScore = Math.min(100, Math.max(0, (1 - metrics.deaths_per_minute / 0.3) * 100));

    return Math.round(deathScore * 10) / 10;
  }

  /**
   * Compute overall performance score (weighted average of 4 factors)
   */
  private computeOverallScore(scores: {
    economyScore: number | null;
    objectivesScore: number | null;
    mapControlScore: number | null;
    errorRateScore: number | null;
  }): number | null {
    const validScores: number[] = [];
    const weights: number[] = [];

    if (scores.economyScore !== null) {
      validScores.push(scores.economyScore);
      weights.push(0.3); // 30% weight
    }
    if (scores.objectivesScore !== null) {
      validScores.push(scores.objectivesScore);
      weights.push(0.25); // 25% weight
    }
    if (scores.mapControlScore !== null) {
      validScores.push(scores.mapControlScore);
      weights.push(0.20); // 20% weight
    }
    if (scores.errorRateScore !== null) {
      validScores.push(scores.errorRateScore);
      weights.push(0.25); // 25% weight
    }

    if (validScores.length === 0) return null;

    // Weighted average
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const weightedSum = validScores.reduce((sum, score, i) => sum + score * weights[i], 0);

    return Math.round((weightedSum / totalWeight) * 10) / 10;
  }

  /**
   * Compute timeline analytics (first blood, objectives, tempo shifts)
   */
  async computeTimelineAnalytics(matchId: string): Promise<void> {
    console.log(`Computing timeline analytics for match ${matchId}`);

    // First blood
    const firstBloodQuery = `
      SELECT timestamp_ms, killer_participant_id
      FROM match_timeline_event
      WHERE match_id = :match_id::uuid
        AND event_type = 'CHAMPION_KILL'
      ORDER BY timestamp_ms ASC
      LIMIT 1
    `;

    const firstBlood = await this.rdsClient.executeStatement(firstBloodQuery, [
      { name: 'match_id', value: { stringValue: matchId } }
    ]);

    let firstBloodTimestamp = null;
    let firstBloodTeamId = null;
    let firstBloodKillerParticipantId = null;

    if (firstBlood.records && firstBlood.records.length > 0) {
      firstBloodTimestamp = Number(firstBlood.records[0][0].longValue);
      firstBloodKillerParticipantId = Number(firstBlood.records[0][1].longValue);

      // Get team_id from participant
      const teamQuery = `
        SELECT team_id FROM match_participant
        WHERE match_id = :match_id::uuid AND participant_id = :participant_id
      `;
      const teamResult = await this.rdsClient.executeStatement(teamQuery, [
        { name: 'match_id', value: { stringValue: matchId } },
        { name: 'participant_id', value: { longValue: firstBloodKillerParticipantId } }
      ]);
      firstBloodTeamId = teamResult.records?.[0]?.[0]?.longValue
        ? Number(teamResult.records[0][0].longValue)
        : null;
    }

    // First tower (similar pattern)
    const firstTowerQuery = `
      SELECT timestamp_ms, killer_participant_id
      FROM match_timeline_event
      WHERE match_id = :match_id::uuid
        AND event_type = 'BUILDING_KILL'
        AND building_type = 'TOWER_BUILDING'
      ORDER BY timestamp_ms ASC
      LIMIT 1
    `;

    const firstTower = await this.rdsClient.executeStatement(firstTowerQuery, [
      { name: 'match_id', value: { stringValue: matchId } }
    ]);

    let firstTowerTimestamp = null;
    let firstTowerTeamId = null;

    if (firstTower.records && firstTower.records.length > 0) {
      firstTowerTimestamp = Number(firstTower.records[0][0].longValue);
      const killerId = Number(firstTower.records[0][1].longValue);

      const teamQuery = `
        SELECT team_id FROM match_participant
        WHERE match_id = :match_id::uuid AND participant_id = :participant_id
      `;
      const teamResult = await this.rdsClient.executeStatement(teamQuery, [
        { name: 'match_id', value: { stringValue: matchId } },
        { name: 'participant_id', value: { longValue: killerId } }
      ]);
      firstTowerTeamId = teamResult.records?.[0]?.[0]?.longValue
        ? Number(teamResult.records[0][0].longValue)
        : null;
    }

    // First dragon and baron (similar pattern)
    // ... (abbreviated for length, follow same pattern)

    const timelineData: TimelineAnalyticsData = {
      match_id: matchId,
      first_blood_timestamp_ms: firstBloodTimestamp,
      first_blood_team_id: firstBloodTeamId,
      first_blood_killer_participant_id: firstBloodKillerParticipantId,
      first_tower_timestamp_ms: firstTowerTimestamp,
      first_tower_team_id: firstTowerTeamId,
      first_dragon_timestamp_ms: null, // TODO
      first_dragon_team_id: null,
      first_baron_timestamp_ms: null,
      first_baron_team_id: null,
      avg_players_near_dragon_kills: null,
      avg_players_near_baron_kills: null,
      objective_steals_count: null,
      gold_swing_events: null,
      ace_timestamps: null
    };

    await this.analyticsRepo.upsertTimelineAnalytics(timelineData);
    console.log('Timeline analytics computed');
  }

  /**
   * Compute rolling analytics for a player across last N matches
   */
  async computeRollingAnalytics(
    playerProfileId: string,
    matchCount: number = 20,
    queueId?: number,
    championId?: number,
    teamPosition?: string
  ): Promise<void> {
    console.log(`Computing rolling analytics for player ${playerProfileId}`);

    // Build WHERE clause for filters
    const filters: string[] = ['mp.player_profile_id = :player_profile_id::uuid'];
    const params: any[] = [
      { name: 'player_profile_id', value: { stringValue: playerProfileId } }
    ];

    if (queueId) {
      filters.push('m.queue_id = :queue_id');
      params.push({ name: 'queue_id', value: { longValue: queueId } });
    }

    if (championId) {
      filters.push('mp.champion_id = :champion_id');
      params.push({ name: 'champion_id', value: { longValue: championId } });
    }

    if (teamPosition) {
      filters.push('mp.team_position = :team_position');
      params.push({ name: 'team_position', value: { stringValue: teamPosition } });
    }

    const whereClause = filters.join(' AND ');

    // Get last N match IDs
    const matchIdsQuery = `
      SELECT m.id
      FROM match m
      JOIN match_participant mp ON mp.match_id = m.id
      WHERE ${whereClause}
      ORDER BY m.started_at DESC
      LIMIT ${matchCount}
    `;

    const matchIdsResult = await this.rdsClient.executeStatement(matchIdsQuery, params);

    if (!matchIdsResult.records || matchIdsResult.records.length === 0) {
      console.warn(`No matches found for player ${playerProfileId}`);
      return;
    }

    const matchIds = matchIdsResult.records.map(r => r[0].stringValue!);

    // Compute averages
    const avgQuery = `
      SELECT
        AVG(mpa.economy_score) as avg_economy,
        AVG(mpa.objectives_score) as avg_objectives,
        AVG(mpa.map_control_score) as avg_map_control,
        AVG(mpa.error_rate_score) as avg_error,
        AVG(mpa.overall_performance_score) as avg_overall,
        SUM(CASE WHEN mp.win THEN 1 ELSE 0 END)::DECIMAL / COUNT(*) * 100 as win_rate,
        COUNT(*) as total
      FROM match_participant_analytics mpa
      JOIN match_participant mp ON mp.id = mpa.match_participant_id
      WHERE ${whereClause}
      ORDER BY mp.match_id
    `;

    const avgResult = await this.rdsClient.executeStatement(avgQuery, params);

    const avgRow = avgResult.records?.[0];
    if (!avgRow) return;

    const rollingData: RollingAnalyticsData = {
      player_profile_id: playerProfileId,
      match_count: matchCount,
      champion_id: championId || null,
      queue_id: queueId || null,
      team_position: teamPosition || null,
      avg_economy_score: avgRow[0].doubleValue || null,
      avg_objectives_score: avgRow[1].doubleValue || null,
      avg_map_control_score: avgRow[2].doubleValue || null,
      avg_error_rate_score: avgRow[3].doubleValue || null,
      avg_overall_performance: avgRow[4].doubleValue || null,
      win_rate: avgRow[5].doubleValue || null,
      total_matches: Number(avgRow[6].longValue || 0),
      economy_trend: null, // TODO: Compute from first half vs second half
      objectives_trend: null,
      map_control_trend: null,
      error_rate_trend: null,
      match_ids: matchIds
    };

    await this.analyticsRepo.upsertRollingAnalytics(rollingData);
    console.log('Rolling analytics computed');
  }
}
