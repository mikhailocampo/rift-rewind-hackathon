/**
 * Compute Silver Analytics Lambda
 *
 * Triggered by SQS queue (receives match ingestion events from EventBridge)
 * Computes SILVER layer analytics from BRONZE data:
 * - Participant analytics (4-factor scores)
 * - Timeline analytics (first blood, objectives)
 * - Rolling analytics (for each player)
 *
 * @param event SQS event with match ingestion details
 * @returns SQS batch response with successes/failures
 */

import { SQSEvent, SQSBatchItemFailure } from 'aws-lambda';
import { SilverAnalyticsService } from '../services/silverAnalyticsService';
import { MatchIngestedEvent } from '../types';

const RANKED_QUEUE_IDS = [420, 440]; // Ranked Solo/Duo and Ranked Flex

export const handler = async (
  event: SQSEvent
): Promise<{ batchItemFailures: SQSBatchItemFailure[] }> => {
  console.log(`Received ${event.Records.length} SQS messages`);

  const service = new SilverAnalyticsService();
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      console.log(`Processing SQS message: ${record.messageId}`);

      // Parse EventBridge event from SQS message
      const matchEvent: MatchIngestedEvent = JSON.parse(record.body);

      console.log(`Match event: ${JSON.stringify(matchEvent)}`);

      // Validate this is a ranked match
      if (!RANKED_QUEUE_IDS.includes(matchEvent.queueId)) {
        console.log(
          `Skipping non-ranked match ${matchEvent.externalMatchId} (queueId: ${matchEvent.queueId})`
        );
        // Successfully processed (skip), delete from queue
        continue;
      }

      console.log(
        `Computing silver analytics for ranked match ${matchEvent.externalMatchId} (queueId: ${matchEvent.queueId})`
      );

      // OPTIMIZATION: Check if analytics already computed (deduplication)
      const alreadyComputed = await service.checkIfAnalyticsExist(matchEvent.matchId);
      if (alreadyComputed) {
        console.log(
          `Silver analytics already computed for match ${matchEvent.matchId}, skipping duplicate processing`
        );
        // Successfully processed (skip duplicate), delete from queue
        continue;
      }

      // Compute participant analytics (4-factor model for all 10 players)
      await service.computeParticipantAnalytics(matchEvent.matchId);

      // Compute timeline analytics (first blood, objectives, tempo)
      await service.computeTimelineAnalytics(matchEvent.matchId);

      // Compute rolling analytics for each participant
      // This updates the last-N-matches aggregates for each player
      await computeRollingAnalyticsForMatch(service, matchEvent.matchId);

      console.log(`Successfully computed silver analytics for match ${matchEvent.matchId}`);
    } catch (error: any) {
      console.error(`Failed to process match analytics:`, error);

      // Add to batch item failures (SQS will retry)
      batchItemFailures.push({
        itemIdentifier: record.messageId
      });
    }
  }

  return {
    batchItemFailures
  };
};

/**
 * Compute rolling analytics for all participants in a match
 */
async function computeRollingAnalyticsForMatch(
  service: SilverAnalyticsService,
  matchId: string
): Promise<void> {
  // Get all player profile IDs from this match
  const { RdsDataClient } = await import('../database/rdsDataClient');
  const rdsClient = new RdsDataClient();

  const playersQuery = `
    SELECT DISTINCT player_profile_id
    FROM match_participant
    WHERE match_id = :match_id::uuid
      AND player_profile_id IS NOT NULL
  `;

  const playersResult = await rdsClient.executeStatement(playersQuery, [
    { name: 'match_id', value: { stringValue: matchId } }
  ]);

  if (!playersResult.records || playersResult.records.length === 0) {
    console.warn(`No players with profiles found in match ${matchId}`);
    return;
  }

  // Compute rolling analytics for each player (last 20 ranked matches)
  for (const playerRow of playersResult.records) {
    const playerProfileId = playerRow[0].stringValue;
    if (!playerProfileId) continue;

    try {
      // Compute for last 20 ranked games (all champions, all positions)
      await service.computeRollingAnalytics(playerProfileId, 20, 420); // Ranked Solo/Duo
      await service.computeRollingAnalytics(playerProfileId, 20, 440); // Ranked Flex

      console.log(`Computed rolling analytics for player ${playerProfileId}`);
    } catch (error: any) {
      console.error(`Failed to compute rolling analytics for player ${playerProfileId}:`, error);
      // Don't fail the entire batch if one player's rolling analytics fails
    }
  }
}
