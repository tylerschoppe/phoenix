# Filtered Header Metrics Backend Implementation Guide

## Overview
The backend now supports filtering capabilities for three key header metrics: trace count, cost summary, and latency quantiles. This enables the frontend to display metrics filtered by span conditions or session I/O content.

## New GraphQL Parameters

### Available on all three resolvers:
- `trace_count(filterCondition: String, sessionFilter: String)`
- `costSummary(filterCondition: String, sessionFilter: String)` 
- `latencyMsQuantile(probability: Float!, filterCondition: String, sessionFilter: String)`

## Parameter Usage

### `filterCondition: String` (Optional)
Filters data using span filter expressions. This parameter works on **span properties** to determine which traces/data to include.

**Common examples:**
```graphql
# Filter by span kind
traceCount(filterCondition: "span_kind == 'LLM'")

# Filter by span status
costSummary(filterCondition: "status_code == 'ERROR'")

# Complex span filters
latencyMsQuantile(probability: 0.5, filterCondition: "span_kind == 'LLM' and status_code == 'OK'")
```

### `sessionFilter: String` (Optional)
Filters data by session I/O content or session ID. This parameter works on **session-level data**.

**Examples:**
```graphql
# Filter by session content (searches input/output text)
costSummary(sessionFilter: "important query")

# Filter by specific session ID (UUID format)
traceCount(sessionFilter: "123e4567-e89b-12d3-a456-426614174000")
```

## Behavior Details

### Trace Count Filtering
- **Without filters**: Returns total number of traces
- **With `filterCondition`**: Returns count of traces that contain spans matching the filter
- **With `sessionFilter`**: Returns count of traces in sessions matching the filter
- **Both filters**: Returns traces that match both conditions (AND logic)

```graphql
query {
  node(id: $projectId) {
    ... on Project {
      # All traces
      totalTraces: traceCount
      
      # Only traces with LLM spans  
      llmTraces: traceCount(filterCondition: "span_kind == 'LLM'")
      
      # Only traces from sessions containing "error"
      errorSessions: traceCount(sessionFilter: "error")
      
      # LLM traces from error sessions
      filtered: traceCount(
        filterCondition: "span_kind == 'LLM'"
        sessionFilter: "error"
      )
    }
  }
}
```

### Cost Summary Filtering
- Returns aggregated cost data (prompt, completion, total) for filtered traces only
- Costs are recalculated based on the filtered dataset

```graphql
query {
  node(id: $projectId) {
    ... on Project {
      # Total costs across all data
      totalCosts: costSummary {
        total { cost tokens }
        prompt { cost tokens }
        completion { cost tokens }
      }
      
      # Costs for specific session content
      importantCosts: costSummary(sessionFilter: "important") {
        total { cost }
      }
      
      # Costs for error spans only
      errorCosts: costSummary(filterCondition: "status_code == 'ERROR'") {
        total { cost }
      }
    }
  }
}
```

### Latency Quantile Filtering
- Calculates percentiles on filtered trace latencies only
- Essential for understanding performance of specific span types or sessions

```graphql
query {
  node(id: $projectId) {
    ... on Project {
      # P95 latency across all traces
      overallP95: latencyMsQuantile(probability: 0.95)
      
      # P95 latency for LLM spans only
      llmP95: latencyMsQuantile(
        probability: 0.95
        filterCondition: "span_kind == 'LLM'"
      )
      
      # P50 latency for specific session content
      sessionP50: latencyMsQuantile(
        probability: 0.50
        sessionFilter: "complex query"
      )
    }
  }
}
```

## Session Filter Logic Details

### String Content Matching
When `sessionFilter` is a regular string (not UUID format):
- Searches in **root span** input and output attributes
- Uses case-sensitive substring matching
- Matches either input OR output content (OR logic)

### Session ID Matching  
When `sessionFilter` matches UUID format (`/^[0-9a-f-]{36}$/i`):
- Directly filters by exact session ID
- More efficient than content matching

## Frontend Integration Tips

### 1. Conditional Queries
Use GraphQL aliases to get both filtered and unfiltered data in one request:

```graphql
query HeaderMetrics($projectId: ID!, $spanFilter: String, $sessionFilter: String) {
  node(id: $projectId) {
    ... on Project {
      total: traceCount
      filtered: traceCount(
        filterCondition: $spanFilter
        sessionFilter: $sessionFilter
      )
      
      totalCost: costSummary { total { cost } }
      filteredCost: costSummary(
        filterCondition: $spanFilter
        sessionFilter: $sessionFilter
      ) { total { cost } }
    }
  }
}
```

### 2. Filter State Management
```typescript
interface FilterState {
  spanFilter?: string;    // e.g., "span_kind == 'LLM'"
  sessionFilter?: string; // e.g., "important query" or session UUID
}

// Apply filters to queries
const variables = {
  projectId,
  ...(filters.spanFilter && { spanFilter: filters.spanFilter }),
  ...(filters.sessionFilter && { sessionFilter: filters.sessionFilter })
};
```

### 3. Performance Considerations
- Both filters are cached by the backend dataloaders
- Combining filters uses AND logic (both must match)
- Session UUID filtering is more efficient than content matching
- Results are cached for 1 hour by default

### 4. Error Handling
All parameters are optional and backward compatible:
- Missing parameters behave as if no filter applied
- Invalid filter syntax returns GraphQL errors
- Empty results return zero/null values appropriately

## Testing the Implementation

The backend includes comprehensive tests that verify:
- Filtered results differ from unfiltered results
- Span filtering correctly counts traces containing matching spans  
- Session filtering correctly filters by I/O content
- Quantile calculations work correctly on filtered datasets

This ensures reliable behavior for frontend integration.