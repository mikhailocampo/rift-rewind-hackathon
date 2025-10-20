import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ProfileService } from './services/profileService';
import { RiotProfileRequest } from './types';

/**
 * Riot Profile Fetcher Lambda
 * 
 * Fetches player profile from Riot API and stores in Aurora PostgreSQL.
 * Uses builder pattern ETL: Extract (Riot API) → Transform (ProfileDataBuilder) → Load (RDS Data API)
 * 
 * @param event.body {gameName: string, tagLine: string} - Required Riot ID components
 * @returns {success: boolean, data?: ProfileData, error?: string, statusCode: number}
 * 
 * Features:
 * - Idempotent: Same gameName/tagLine safely updates existing record
 * - Rate limiting: Exponential backoff retry (3 attempts)
 * - Error handling: 400/404/429/500 with descriptive messages
 * 
 * Test: POST /profile with {"gameName":"darling","tagLine":"gfg6"}
 */
export const riotProfileFetcher = async (
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

    let requestData: RiotProfileRequest;
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

    // Process the profile request
    const profileService = new ProfileService();
    const result = await profileService.fetchAndStoreProfile(requestData);

    return {
      statusCode: result.statusCode || (result.success ? 200 : 500),
      headers: corsHeaders,
      body: JSON.stringify(result)
    };

  } catch (error: any) {
    console.error('Unhandled error in handler:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error'
      })
    };
  }
};