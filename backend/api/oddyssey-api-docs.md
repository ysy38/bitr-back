# Oddyssey API Documentation

## Overview

The Oddyssey API provides endpoints for managing and retrieving daily prediction game matches. All endpoints use persistent storage to ensure consistency throughout the day.

## Base URL

```
/api/oddyssey
```

## Endpoints

### 1. Health Check

**GET** `/health`

Returns the health status of the Oddyssey API service and its dependencies.

**Response:**
```json
{
  "status": "healthy|warning|unhealthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "service": "oddyssey-api",
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "healthy",
      "message": "Database connection successful"
    },
    "oddyssey_schema": {
      "status": "healthy",
      "message": "Oddyssey schema exists"
    },
    "daily_game_matches_table": {
      "status": "healthy",
      "message": "daily_game_matches table exists"
    },
    "todays_matches": {
      "status": "healthy",
      "message": "Found 10 matches for today (expected: 10)",
      "count": 10,
      "date": "2025-01-15"
    },
    "persistent_service": {
      "status": "healthy",
      "message": "Exactly 10 matches found",
      "details": {
        "date": "2025-01-15",
        "count": 10,
        "expected": 10
      }
    }
  }
}
```

### 2. Get Current Matches

**GET** `/matches`

**Query Parameters:**
- `date` (optional): Date in YYYY-MM-DD format. Defaults to today.

Returns daily matches from persistent storage.

**Response:**
```json
{
  "success": true,
  "data": {
    "today": {
      "date": "2025-01-15",
      "matches": [
        {
          "id": "123456",
          "fixture_id": "123456",
          "home_team": "Manchester United",
          "away_team": "Liverpool",
          "league_name": "Premier League",
          "match_date": "2025-01-15T20:00:00Z",
          "display_order": 1,
          "odds": {
            "home": 2.5,
            "draw": 3.2,
            "away": 2.8,
            "over_25": 1.9,
            "under_25": 1.9
          }
        }
      ],
      "count": 10
    }
  },
  "meta": {
    "total_matches": 10,
    "expected_matches": 10,
    "cycle_id": 123,
    "source": "persistent_storage",
    "operation": "get_matches"
  }
}
```

### 3. Get Results by Date

**GET** `/results/:date`

**Path Parameters:**
- `date` (required): Date in YYYY-MM-DD format.

Returns match results for a specific date. This endpoint enables date picker functionality in the UI.

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2025-01-15",
    "cycleId": 123,
    "isResolved": true,
    "cycleStartTime": "2025-01-15T00:00:00Z",
    "matches": [
      {
        "id": "123456",
        "fixture_id": "123456",
        "home_team": "Manchester United",
        "away_team": "Liverpool",
        "league_name": "Premier League",
        "match_date": "2025-01-15T20:00:00Z",
        "status": "finished",
        "display_order": 1,
        "result": {
          "home_score": 2,
          "away_score": 1,
          "outcome_1x2": "1",
          "outcome_ou25": "over",
          "finished_at": "2025-01-15T22:00:00Z",
          "is_finished": true
        }
      }
    ],
    "totalMatches": 10,
    "finishedMatches": 10
  },
  "meta": {
    "source": "date_based_query",
    "operation": "get_results_by_date"
  }
}
```

### 4. Get Available Dates

**GET** `/available-dates`

Returns a list of available dates for the date picker (last 30 days with cycles).

**Response:**
```json
{
  "success": true,
  "data": {
    "availableDates": [
      {
        "date": "2025-01-15",
        "cycleId": 123,
        "isResolved": true,
        "cycleCount": 1
      },
      {
        "date": "2025-01-14",
        "cycleId": 122,
        "isResolved": true,
        "cycleCount": 1
      }
    ],
    "totalDates": 30,
    "dateRange": {
      "oldest": "2024-12-16",
      "newest": "2025-01-15"
    }
  },
  "meta": {
    "source": "date_picker_query",
    "operation": "get_available_dates"
  }
}
```

### 5. Get Cycle Results

**GET** `/cycle/:cycleId/results`

**Path Parameters:**
- `cycleId` (required): The cycle ID to get results for.

Returns match results for a specific cycle.

**Response:**
```json
{
  "success": true,
  "data": {
    "cycleId": 123,
    "isResolved": true,
    "cycleStartTime": "2025-01-15T00:00:00Z",
    "matches": [
      {
        "id": "123456",
        "fixture_id": "123456",
        "home_team": "Manchester United",
        "away_team": "Liverpool",
        "league_name": "Premier League",
        "match_date": "2025-01-15T20:00:00Z",
        "status": "finished",
        "display_order": 1,
        "result": {
          "home_score": 2,
          "away_score": 1,
          "outcome_1x2": "1",
          "outcome_ou25": "over",
          "finished_at": "2025-01-15T22:00:00Z",
          "is_finished": true
        }
      }
    ],
    "totalMatches": 10,
    "finishedMatches": 10
  }
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

## Date Format

All dates should be provided in ISO 8601 format: `YYYY-MM-DD`

## Status Values

Match status can be one of:
- `finished`: Match has completed
- `live`: Match is currently in progress
- `upcoming`: Match is scheduled for the future
- `delayed`: Match was scheduled but hasn't started
- `unknown`: Status cannot be determined

## Outcome Values

1X2 outcomes:
- `1`: Home team won
- `X`: Draw
- `2`: Away team won

Over/Under 2.5 outcomes:
- `over`: Total goals > 2.5
- `under`: Total goals < 2.5