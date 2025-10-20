import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MatchIngestionService } from '../services/matchIngestionService';
import { RiotRegion } from '../types';

/**
 * Fetch Match IDs Lambda
 *
 * Gets list of match IDs for a player by PUUID.
 * This is a passthrough to Riot API for now.
 *
 * @param event.pathParameters.puuid - Player PUUID
 * @param event.queryStringParameters.start - Starting index (optional, default 0)
 * @param event.queryStringParameters.count - Number of matches (optional, default 20, max 100)
 * @param event.queryStringParameters.region - Region (optional, default americas)
 * @returns {matchIds: string[]}
 *
 * Example: GET /matches/player/{puuid}?start=0&count=20&region=americas
 */
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
    const start = parseInt(event.queryStringParameters?.start || '0', 10);
    const count = Math.min(parseInt(event.queryStringParameters?.count || '20', 10), 100);
    const region = (event.queryStringParameters?.region as RiotRegion) || RiotRegion.AMERICAS;

    console.log(`Fetching ${count} match IDs for PUUID: ${puuid} from region: ${region}`);

    // Fetch match IDs
    const service = new MatchIngestionService(region);
    const matchIds = await service.fetchPlayerMatchIds(puuid, count);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        puuid,
        matchIds,
        count: matchIds.length,
        start,
        region
      })
    };

  } catch (error: any) {
    console.error('Error fetching match IDs:', error);

    return {
      statusCode: error.message?.includes('not found') ? 404 : 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch match IDs'
      })
    };
  }
};
