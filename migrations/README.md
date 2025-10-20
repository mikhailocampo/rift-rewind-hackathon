# Database Migrations

This directory contains SQL migration scripts for the Rift Rewind database schema.

## Migration Files

### 001_bronze_schema.sql
Creates BRONZE layer tables for raw match data storage:
- Enhances existing `match` table
- Creates `match_participant` table (player performance per match)
- Creates `match_team` table (team objectives and bans)
- Creates `match_timeline_frame` table (minute-by-minute stats)
- Creates `match_timeline_event` table (all timeline events)
- Adds indexes and helper functions

### 002_silver_schema.sql
Creates SILVER layer tables for derived analytics:
- Creates `match_participant_analytics` table (4 factor scores)
- Creates `match_timeline_analytics` table (match-level tempo)
- Creates `player_rolling_analytics` table (multi-match aggregates)
- Creates helper functions for BRONZE→SILVER transformations
- Creates views for common queries

## Running Migrations

### Local PostgreSQL
```bash
psql -h localhost -U postgres -d rift_rewind -f migrations/001_bronze_schema.sql
psql -h localhost -U postgres -d rift_rewind -f migrations/002_silver_schema.sql
```

### AWS RDS via psql
```bash
# Set environment variables
export PGHOST=rift-rewind.xxxxxx.us-west-1.rds.amazonaws.com
export PGUSER=postgres
export PGDATABASE=postgres
export PGPASSWORD=your_password

# Run migrations
psql -f migrations/001_bronze_schema.sql
psql -f migrations/002_silver_schema.sql
```

### AWS RDS Data API (via Lambda)
Create a Lambda function that executes the SQL:

```typescript
import { RDSDataService } from 'aws-sdk';
import * as fs from 'fs';

const rds = new RDSDataService();

export const runMigration = async () => {
  const sql = fs.readFileSync('migrations/001_bronze_schema.sql', 'utf-8');

  const result = await rds.executeStatement({
    resourceArn: process.env.RDS_CLUSTER_ARN!,
    secretArn: process.env.RDS_SECRET_ARN!,
    database: 'postgres',
    sql: sql
  }).promise();

  console.log('Migration completed:', result);
};
```

## Verifying Migrations

After running migrations, verify tables were created:

```sql
-- List all tables
\dt

-- Check BRONZE tables
\d+ match
\d+ match_participant
\d+ match_team
\d+ match_timeline_frame
\d+ match_timeline_event

-- Check SILVER tables
\d+ match_participant_analytics
\d+ match_timeline_analytics
\d+ player_rolling_analytics

-- Check views
\dv v_player_recent_performance
\dm mv_player_leaderboard

-- Check functions
\df is_same_team
\df calculate_distance
\df get_lane_from_position
\df normalize_score
\df calculate_trend
```


