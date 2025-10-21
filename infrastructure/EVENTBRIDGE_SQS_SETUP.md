# EventBridge + SQS Infrastructure Setup Guide

This guide walks through setting up the event-driven architecture for bronze→silver ETL processing.

## Architecture Overview

```
ingestMatch Lambda (Bronze)
  → EventBridge Event (match.ingested)
  → EventBridge Rule
  → SQS Queue (silver-analytics-queue)
  → computeSilverAnalytics Lambda
  → Silver tables in RDS
```

## Prerequisites

- AWS CLI configured with credentials
- Serverless Framework deployed (creates base infrastructure)
- RDS cluster running with bronze and silver schemas

---

## Step 1: Create SQS Queues

### 1.1 Create Dead Letter Queue (DLQ)

**AWS Console:**
1. Navigate to **SQS** → **Create queue**
2. Configure:
   - **Name:** `silver-analytics-dlq`
   - **Type:** Standard
   - **Visibility timeout:** 30 seconds (default)
   - **Message retention period:** 14 days (keep failed messages longer for investigation)
   - **Receive message wait time:** 0 seconds
   - Leave other settings as default
3. Click **Create queue**
4. **Copy the Queue ARN** - you'll need this for the main queue

### 1.2 Create Main Queue

**AWS Console:**
1. Navigate to **SQS** → **Create queue**
2. Configure:
   - **Name:** `silver-analytics-queue`
   - **Type:** Standard
   - **Visibility timeout:** 180 seconds (3 minutes - matches lambda timeout + buffer)
   - **Message retention period:** 4 days
   - **Receive message wait time:** 20 seconds (enables long polling for cost efficiency)
   - **Maximum receives:** 3 (retry up to 3 times before sending to DLQ)

3. Scroll to **Dead-letter queue** section:
   - Enable **Dead-letter queue**
   - Select the `silver-analytics-dlq` you created
   - **Maximum receives:** 3

4. Click **Create queue**
5. **Copy the Queue URL and ARN** - you'll need these

**Queue ARN format:**
```
arn:aws:sqs:us-west-1:279243015913:silver-analytics-queue
```

---

## Step 2: Configure SQS Queue Policy (Allow EventBridge)

EventBridge needs permission to send messages to your SQS queue.

**AWS Console:**
1. Navigate to **SQS** → Select `silver-analytics-queue`
2. Click **Access policy** tab → **Edit**
3. Add this statement to the existing policy (inside the `Statement` array):

```json
{
  "Sid": "AllowEventBridgeToSendMessages",
  "Effect": "Allow",
  "Principal": {
    "Service": "events.amazonaws.com"
  },
  "Action": "sqs:SendMessage",
  "Resource": "arn:aws:sqs:us-west-1:279243015913:silver-analytics-queue",
  "Condition": {
    "ArnEquals": {
      "aws:SourceArn": "arn:aws:events:us-west-1:279243015913:rule/match-ingested-to-silver-queue"
    }
  }
}
```

**Note:** The `SourceArn` condition uses the EventBridge rule ARN we'll create in Step 3. Update the rule name if you use a different one.

4. Click **Save**

**Full example policy:**
```json
{
  "Version": "2012-10-17",
  "Id": "silver-analytics-queue-policy",
  "Statement": [
    {
      "Sid": "AllowEventBridgeToSendMessages",
      "Effect": "Allow",
      "Principal": {
        "Service": "events.amazonaws.com"
      },
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:us-west-1:279243015913:silver-analytics-queue",
      "Condition": {
        "ArnEquals": {
          "aws:SourceArn": "arn:aws:events:us-west-1:279243015913:rule/match-ingested-to-silver-queue"
        }
      }
    }
  ]
}
```

---

## Step 3: Create EventBridge Rule

**AWS Console:**
1. Navigate to **EventBridge** → **Rules** → **Create rule**

2. **Step 1: Define rule detail**
   - **Name:** `match-ingested-to-silver-queue`
   - **Description:** Routes match ingestion events to silver analytics SQS queue
   - **Event bus:** default
   - **Rule type:** Rule with an event pattern
   - Click **Next**

3. **Step 2: Build event pattern**
   - **Event source:** Other
   - **Event pattern:** Custom pattern (JSON editor)
   - Paste this pattern:

```json
{
  "source": ["rift-rewind.match-ingestion"],
  "detail-type": ["Match Ingested"]
}
```

   - Click **Next**

4. **Step 3: Select targets**
   - **Target types:** AWS service
   - **Select a target:** SQS queue
   - **Queue:** Select `silver-analytics-queue` from dropdown
   - **Message group ID:** Leave empty (not needed for standard queues)
   - **Configure target input:**
     - Select **Input transformer**
     - **Input path:**
       ```json
       {
         "matchId": "$.detail.matchId",
         "externalMatchId": "$.detail.externalMatchId",
         "queueId": "$.detail.queueId",
         "participantCount": "$.detail.participantCount",
         "timestamp": "$.detail.timestamp"
       }
       ```
     - **Template:**
       ```json
       {
         "matchId": "<matchId>",
         "externalMatchId": "<externalMatchId>",
         "queueId": <queueId>,
         "participantCount": <participantCount>,
         "timestamp": "<timestamp>"
       }
       ```
   - Click **Next**

5. **Step 4: Configure tags** (optional)
   - Add tags if desired
   - Click **Next**

6. **Step 5: Review and create**
   - Review settings
   - Click **Create rule**

---

## Step 4: Update IAM Roles (via serverless.yml)

The serverless.yml file will handle most IAM permissions via CloudFormation. However, verify these are included:

### For `ingestMatch` Lambda:
```yaml
- Effect: Allow
  Action:
    - events:PutEvents
  Resource:
    - arn:aws:events:us-west-1:279243015913:event-bus/default
```

### For `computeSilverAnalytics` Lambda:
```yaml
- Effect: Allow
  Action:
    - sqs:ReceiveMessage
    - sqs:DeleteMessage
    - sqs:GetQueueAttributes
    - sqs:ChangeMessageVisibility
  Resource:
    - arn:aws:sqs:us-west-1:279243015913:silver-analytics-queue
```

**These will be automatically added when you deploy the updated serverless.yml**

---

## Step 5: Deploy Updated Serverless Configuration

After updating serverless.yml (see next section), deploy:

```bash
npm run build
npx serverless deploy
```

This will:
- Create the `computeSilverAnalytics` lambda function
- Create the `getPlayerMatches` lambda function
- Add IAM permissions for EventBridge and SQS
- Configure SQS event source for the lambda

---

## Step 6: Verify Setup

### Test EventBridge → SQS Flow

**Send a test event:**

```bash
aws events put-events \
  --entries '[
    {
      "Source": "rift-rewind.match-ingestion",
      "DetailType": "Match Ingested",
      "Detail": "{\"matchId\":\"test-uuid-123\",\"externalMatchId\":\"NA1_TEST\",\"queueId\":420,\"participantCount\":10,\"timestamp\":\"2025-10-20T10:00:00Z\"}"
    }
  ]'
```

**Check SQS received the message:**

```bash
aws sqs receive-message \
  --queue-url https://sqs.us-west-1.amazonaws.com/279243015913/silver-analytics-queue \
  --max-number-of-messages 1
```

You should see the message with the transformed JSON.

**Delete the test message:**

```bash
aws sqs purge-queue \
  --queue-url https://sqs.us-west-1.amazonaws.com/279243015913/silver-analytics-queue
```

---

## Monitoring & Troubleshooting

### CloudWatch Metrics to Monitor

1. **SQS Queue Depth**
   - Metric: `ApproximateNumberOfMessagesVisible`
   - Alarm if > 100 (backlog building up)

2. **DLQ Messages**
   - Metric: `ApproximateNumberOfMessagesVisible` on DLQ
   - Alarm if > 0 (systematic failures)

3. **Lambda Errors**
   - Metric: `Errors` on `computeSilverAnalytics` function
   - Alarm if error rate > 5%

4. **Lambda Duration**
   - Metric: `Duration` on `computeSilverAnalytics`
   - Track p50, p95, p99 to optimize

### Common Issues

**Issue:** EventBridge rule not triggering
- **Check:** Rule is enabled (default: enabled)
- **Check:** Event pattern matches exactly (source and detail-type)
- **Test:** Use AWS Console EventBridge → Rules → Test event pattern

**Issue:** SQS not receiving messages
- **Check:** SQS queue policy allows EventBridge (Step 2)
- **Check:** EventBridge rule target is configured correctly
- **Check:** EventBridge rule ARN in SQS policy matches actual rule ARN

**Issue:** Lambda not processing messages
- **Check:** Lambda has SQS event source mapping configured
- **Check:** Lambda execution role has SQS permissions
- **View:** Lambda → Configuration → Triggers shows SQS

**Issue:** Messages going to DLQ
- **Check:** Lambda logs in CloudWatch for error details
- **Check:** Lambda timeout is sufficient (should be 120-180 seconds)
- **Check:** Database connectivity (security groups, VPC config if applicable)

---

## Cost Estimation

**SQS:**
- Free tier: 1M requests/month
- After free tier: $0.40 per 1M requests
- **Estimate:** 10,000 matches/month = $0.004/month (negligible)

**EventBridge:**
- Free tier: All custom events are free
- **Cost:** $0

**Lambda:**
- Free tier: 1M requests + 400,000 GB-seconds/month
- `computeSilverAnalytics` @ 512MB, 30s avg execution:
  - 10,000 invocations = 150,000 GB-seconds
- **Estimate:** Well within free tier

**Total additional cost:** ~$0/month for initial scale

---

## Cleanup (if needed)

To remove the infrastructure:

```bash
# Delete EventBridge rule
aws events delete-rule --name match-ingested-to-silver-queue

# Purge and delete SQS queues
aws sqs purge-queue --queue-url https://sqs.us-west-1.amazonaws.com/279243015913/silver-analytics-queue
aws sqs delete-queue --queue-url https://sqs.us-west-1.amazonaws.com/279243015913/silver-analytics-queue
aws sqs delete-queue --queue-url https://sqs.us-west-1.amazonaws.com/279243015913/silver-analytics-dlq

# Remove serverless stack
npx serverless remove
```
