/**
 * EventBridge Client
 *
 * Helper utility to publish events to AWS EventBridge
 * Used to trigger downstream lambdas (bronze→silver ETL)
 */

import { EventBridge } from 'aws-sdk';
import { MatchIngestedEvent } from '../types';

export class EventBridgeClient {
  private eventBridge: EventBridge;
  private readonly eventBusName: string;
  private readonly source: string;

  constructor() {
    this.eventBridge = new EventBridge();
    this.eventBusName = process.env.EVENT_BUS_NAME || 'default';
    this.source = 'rift-rewind.match-ingestion';
  }

  /**
   * Publish a match ingested event
   * This triggers the silver analytics ETL pipeline
   */
  async publishMatchIngestedEvent(event: MatchIngestedEvent): Promise<void> {
    const params: EventBridge.PutEventsRequest = {
      Entries: [
        {
          Source: this.source,
          DetailType: 'Match Ingested',
          Detail: JSON.stringify(event),
          EventBusName: this.eventBusName,
          Time: new Date()
        }
      ]
    };

    try {
      const result = await this.eventBridge.putEvents(params).promise();

      if (result.FailedEntryCount && result.FailedEntryCount > 0) {
        const failedEntry = result.Entries?.[0];
        throw new Error(
          `Failed to publish EventBridge event: ${failedEntry?.ErrorCode} - ${failedEntry?.ErrorMessage}`
        );
      }

      console.log(`Published match ingested event for match ${event.matchId}`, {
        eventId: result.Entries?.[0]?.EventId,
        externalMatchId: event.externalMatchId,
        queueId: event.queueId
      });
    } catch (error: any) {
      console.error('Error publishing EventBridge event:', error);
      throw new Error(`EventBridge publish failed: ${error.message}`);
    }
  }

  /**
   * Publish multiple match ingested events in a single call
   * EventBridge supports up to 10 events per PutEvents call
   */
  async publishMatchIngestedEvents(events: MatchIngestedEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    // EventBridge limit: max 10 events per request
    const batchSize = 10;

    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      const params: EventBridge.PutEventsRequest = {
        Entries: batch.map(event => ({
          Source: this.source,
          DetailType: 'Match Ingested',
          Detail: JSON.stringify(event),
          EventBusName: this.eventBusName,
          Time: new Date()
        }))
      };

      try {
        const result = await this.eventBridge.putEvents(params).promise();

        if (result.FailedEntryCount && result.FailedEntryCount > 0) {
          console.error(`${result.FailedEntryCount} events failed to publish`, result.Entries);
          throw new Error(`Failed to publish ${result.FailedEntryCount} events`);
        }

        console.log(`Published ${batch.length} match ingested events`);
      } catch (error: any) {
        console.error('Error publishing batch of EventBridge events:', error);
        throw new Error(`EventBridge batch publish failed: ${error.message}`);
      }
    }
  }
}
