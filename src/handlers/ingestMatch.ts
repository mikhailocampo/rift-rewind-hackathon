import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { MatchIngestionService } from '../services/matchIngestionService';
import { RiotRegion } from '../types';

/**
 * Ingest Match Lambda
 *
 * Fetches match + timeline from Riot API and stores in BRONZE layer.
 * This operation is idempotent - safe to call multiple times for the same match.
 *
 * @param event.body {matchId: string, region?: string}
 * @returns {success: boolean, matchId: string, participantsIngested: number, ...}
 *
 * Example: POST /matches/ingest
 * Body: {"matchId": "NA1_5391659560", "region": "americas"}
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Request body is required'
        })
      };
    }

    let requestData: { matchId: string; region?: RiotRegion };
    try {
      requestData = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body'
        })
      };
    }

    // Validate matchId
    if (!requestData.matchId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'matchId is required in request body'
        })
      };
    }

    const matchId = requestData.matchId;
    const region = requestData.region || RiotRegion.AMERICAS;

    console.log(`Starting match ingestion for ${matchId} in region ${region}`);

    // Ingest match
    const service = new MatchIngestionService(region);
    const result = await service.ingestMatch(matchId);

    if (result.success) {
      console.log(`Match ingestion successful: ${JSON.stringify(result)}`);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(result)
      };
    } else {
      console.error(`Match ingestion failed: ${result.error}`);

      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify(result)
      };
    }

  } catch (error: any) {
    console.error('Unhandled error in ingestMatch handler:', error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      })
    };
  }
};
