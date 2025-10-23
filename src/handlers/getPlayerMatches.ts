/**
 * Get Player Matches Lambda
 *
 * Returns list of matches for a player with optional analytics data
 * Used by Next.js frontend for server-side rendering
 *
 * @param event.pathParameters.puuid - Player PUUID
 * @param event.queryStringParameters.includeAnalytics - Include silver analytics (default: true)
 * @param event.queryStringParameters.limit - Number of matches to return (default: 20, max: 100)
 * @returns {success: boolean, matches: PlayerMatchSummary[], ...}
 *
 * Example: GET /players/{puuid}/matches?includeAnalytics=true&limit=20
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { RdsDataClient } from '../database/rdsDataClient';
import { PlayerMatchesResponse, PlayerMatchSummary } from '../types';

const RANKED_QUEUE_IDS = [420, 440]; // Ranked Solo/Duo and Ranked Flex

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    // Get PUUID from path parameters
    const puuid = event.pathParameters?.puuid;
    if (!puuid) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'PUUID is required in path'
        })
      };
    }

    // Get query parameters
    const includeAnalytics = event.queryStringParameters?.includeAnalytics !== 'false'; // Default true
    const limit = Math.min(
      parseInt(event.queryStringParameters?.limit || '20', 10),
      100
    );

    console.log(
      `Fetching ${limit} matches for PUUID: ${puuid}, includeAnalytics: ${includeAnalytics}`
    );

    const rdsClient = new RdsDataClient();

    // Get player profile info
    const profileQuery = `
      SELECT id, riot_gamename, riot_tagline
      FROM player_profile
      WHERE puuid = :puuid
      LIMIT 1
    `;

    const profileResult = await rdsClient.executeStatement(profileQuery, [
      { name: 'puuid', value: { stringValue: puuid } }
    ]);

    if (!profileResult.records || profileResult.records.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Player profile not found'
        })
      };
    }

    const playerProfileId = profileResult.records[0][0].stringValue!;
    const gameName = profileResult.records[0][1].stringValue || undefined;
    const tagLine = profileResult.records[0][2].stringValue || undefined;

    // Build query with optional analytics join
    const analyticsJoin = includeAnalytics
      ? 'LEFT JOIN match_participant_analytics mpa ON mpa.match_participant_id = mp.id'
      : '';

    const analyticsFields = includeAnalytics
      ? `, mpa.economy_score, mpa.objectives_score, mpa.map_control_score,
          mpa.error_rate_score, mpa.overall_performance_score,
          CASE WHEN mpa.id IS NOT NULL THEN TRUE ELSE FALSE END as analytics_computed`
      : '';

    const matchesQuery = `
      SELECT
        m.id as match_id,
        m.external_match_id,
        m.queue_id,
        m.started_at,
        m.duration_seconds,
        mp.win,
        mp.champion_name,
        mp.champion_id,
        mp.team_position,
        mp.kills,
        mp.deaths,
        mp.assists,
        mp.gold_earned,
        mp.cs_total,
        mp.vision_score
        ${analyticsFields}
      FROM match m
      JOIN match_participant mp ON mp.match_id = m.id
      ${analyticsJoin}
      WHERE mp.puuid = :puuid
        AND m.queue_id = ANY(:ranked_queue_ids::int[])
      ORDER BY m.started_at DESC
      LIMIT ${limit}
    `;

    const rankedQueueIdsArray = `{${RANKED_QUEUE_IDS.join(',')}}`;

    const matchesResult = await rdsClient.executeStatement(matchesQuery, [
      { name: 'puuid', value: { stringValue: puuid } },
      { name: 'ranked_queue_ids', value: { stringValue: rankedQueueIdsArray } }
    ]);

    if (!matchesResult.records || matchesResult.records.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          puuid,
          gameName,
          tagLine,
          matches: [],
          totalMatches: 0
        } as PlayerMatchesResponse)
      };
    }

    // Transform records to match summaries
    const matches: PlayerMatchSummary[] = matchesResult.records.map(record => {
      const baseMatch: PlayerMatchSummary = {
        matchId: record[0].stringValue!,
        externalMatchId: record[1].stringValue!,
        queueId: Number(record[2].longValue!),
        startedAt: record[3].stringValue!, // ISO 8601 timestamp
        duration: Number(record[4].longValue!),
        win: record[5].booleanValue!,
        championName: record[6].stringValue!,
        championId: Number(record[7].longValue!),
        teamPosition: record[8].stringValue || null,
        kills: Number(record[9].longValue!),
        deaths: Number(record[10].longValue!),
        assists: Number(record[11].longValue!),
        goldEarned: Number(record[12].longValue!),
        cs: Number(record[13].longValue!),
        visionScore: Number(record[14].longValue!)
      };

      // Add analytics if requested
      if (includeAnalytics) {
        const analyticsComputed = record[20]?.booleanValue || false;

        baseMatch.analytics = {
          economyScore: record[15]?.doubleValue || null,
          objectivesScore: record[16]?.doubleValue || null,
          mapControlScore: record[17]?.doubleValue || null,
          errorRateScore: record[18]?.doubleValue || null,
          overallScore: record[19]?.doubleValue || null,
          computed: analyticsComputed
        };
      }

      return baseMatch;
    });

    const response: PlayerMatchesResponse = {
      success: true,
      puuid,
      gameName,
      tagLine,
      matches,
      totalMatches: matches.length
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response)
    };
  } catch (error: any) {
    console.error('Error fetching player matches:', error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch player matches'
      })
    };
  }
};
