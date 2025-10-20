import { riotProfileFetcher } from '../handler';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock AWS SDK
jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn(() => ({
    getSecretValue: jest.fn(() => ({
      promise: jest.fn(() => Promise.resolve({
        SecretString: JSON.stringify({ riot_api_key: 'test-api-key' })
      }))
    }))
  })),
  RDSDataService: jest.fn(() => ({
    executeStatement: jest.fn(() => ({
      promise: jest.fn(() => Promise.resolve({ records: [] }))
    }))
  }))
}));

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(() => Promise.resolve({
      data: {
        puuid: 'thE7_0RGLjh3C70ntBqYx5Za_WmuG9rdH2N-_8eOFAgCMwX97ZIoxGh6-MUvbOCyCvPJCajxSKIdqA',
        gameName: 'darling',
        tagLine: 'gfg6'
      }
    }))
  }))
}));

describe('Riot Profile Fetcher Handler', () => {
  const mockEvent: APIGatewayProxyEvent = {
    httpMethod: 'POST',
    body: JSON.stringify({ gameName: 'darling', tagLine: 'gfg6' }),
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/profile',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: ''
  };

  test('should successfully process valid riot profile request', async () => {
    const result = await riotProfileFetcher(mockEvent);
    
    expect(result.statusCode).toBe(200);
    
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.puuid).toBe('thE7_0RGLjh3C70ntBqYx5Za_WmuG9rdH2N-_8eOFAgCMwX97ZIoxGh6-MUvbOCyCvPJCajxSKIdqA');
    expect(body.data.riot_gamename).toBe('darling');
    expect(body.data.riot_tagline).toBe('gfg6');
  });

  test('should handle missing request body', async () => {
    const eventWithoutBody = { ...mockEvent, body: null };
    const result = await riotProfileFetcher(eventWithoutBody);
    
    expect(result.statusCode).toBe(400);
    
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Request body is required');
  });

  test('should handle invalid JSON in request body', async () => {
    const eventWithInvalidJson = { ...mockEvent, body: 'invalid json' };
    const result = await riotProfileFetcher(eventWithInvalidJson);
    
    expect(result.statusCode).toBe(400);
    
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid JSON in request body');
  });

  test('should handle CORS preflight request', async () => {
    const optionsEvent = { ...mockEvent, httpMethod: 'OPTIONS' };
    const result = await riotProfileFetcher(optionsEvent);
    
    expect(result.statusCode).toBe(200);
    expect(result.headers).toMatchObject({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    });
  });
});