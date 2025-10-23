/**
 * matchIngestionService.ts
 *
 * Orchestrates the BRONZE layer ETL process:
 * Extract (Riot API) → Transform (MatchDataBuilder) → Load (MatchRepository)
 */

import { RiotApiClient } from '../clients/riotApiClient';
import { MatchDataBuilder } from '../builders/matchDataBuilder';
import { MatchRepository } from '../database/matchRepository';
import { RiotRegion } from '../types';

export interface MatchIngestionResult {
  success: boolean;
  matchId: string;
  externalMatchId: string;
  participantsIngested: number;
  teamsIngested: number;
  framesIngested: number;
  eventsIngested: number;
  error?: string;
}

export class MatchIngestionService {
  private riotClient: RiotApiClient;
  private repository: MatchRepository;

  constructor(region: RiotRegion = RiotRegion.AMERICAS) {
    this.riotClient = new RiotApiClient(region);
    this.repository = new MatchRepository();
  }

  /**
   * Ingest a complete match (match data + timeline) into BRONZE layer
   * This is idempotent - can be safely called multiple times for the same match
   */
  async ingestMatch(externalMatchId: string): Promise<MatchIngestionResult> {
    console.log(`Starting ingestion for match: ${externalMatchId}`);

    try {
      // Step 1: Extract - Fetch data from Riot API
      console.log('Fetching match data from Riot API...');
      const matchResponse = await this.riotClient.getMatch(externalMatchId);

      console.log('Fetching timeline data from Riot API...');
      const timelineResponse = await this.riotClient.getTimeline(externalMatchId);

      // Step 2: Transform - Build database models
      console.log('Transforming API responses to database models...');
      const completeData = MatchDataBuilder.buildCompleteMatchData(matchResponse, timelineResponse);

      // Step 3: Load - Insert into database
      console.log('Inserting match data into database...');
      const matchId = await this.repository.upsertMatch(completeData.match);

      console.log(`Match inserted with ID: ${matchId}`);

      console.log('Inserting participants...');
      await this.repository.insertParticipants(matchId, completeData.participants);

      console.log('Inserting teams...');
      await this.repository.insertTeams(matchId, completeData.teams);

      console.log('Inserting timeline frames...');
      await this.repository.insertTimelineFrames(matchId, completeData.frames);

      console.log('Inserting timeline events...');
      await this.repository.insertTimelineEvents(matchId, completeData.events);

      console.log(`Match ingestion completed successfully for ${externalMatchId}`);

      return {
        success: true,
        matchId,
        externalMatchId,
        participantsIngested: completeData.participants.length,
        teamsIngested: completeData.teams.length,
        framesIngested: completeData.frames.length,
        eventsIngested: completeData.events.length
      };

    } catch (error: any) {
      console.error(`Match ingestion failed for ${externalMatchId}:`, error);

      return {
        success: false,
        matchId: '',
        externalMatchId,
        participantsIngested: 0,
        teamsIngested: 0,
        framesIngested: 0,
        eventsIngested: 0,
        error: error.message || 'Unknown error during match ingestion'
      };
    }
  }

  /**
   * Ingest multiple matches in sequence
   * Returns results for each match
   */
  async ingestMatches(externalMatchIds: string[]): Promise<MatchIngestionResult[]> {
    const results: MatchIngestionResult[] = [];

    for (const matchId of externalMatchIds) {
      const result = await this.ingestMatch(matchId);
      results.push(result);

      // Add small delay between API calls to avoid rate limiting
      if (results.length < externalMatchIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Fetch match IDs for a player and optionally ingest them
   */
  async fetchPlayerMatchIds(puuid: string, count: number = 20): Promise<string[]> {
    console.log(`Fetching ${count} match IDs for PUUID: ${puuid}`);

    try {
      const matchIds = await this.riotClient.getMatchIdsByPUUID(puuid, 0, count);
      console.log(`Found ${matchIds.length} matches for player`);
      return matchIds;
    } catch (error: any) {
      console.error(`Failed to fetch match IDs for PUUID ${puuid}:`, error);
      throw error;
    }
  }
}
