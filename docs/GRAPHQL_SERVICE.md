# GraphQL Service Documentation

## Overview

The GraphQL service provides a unified API for querying and mutating comic metadata. It supports schema stitching with a remote metadata service, comprehensive error handling, validation, caching, and monitoring.

## Architecture

### Components

1. **Main Service** ([`services/graphql.service.ts`](../services/graphql.service.ts))
   - Core GraphQL execution engine
   - Schema initialization and stitching
   - Health monitoring
   - Event handling for auto-resolution

2. **Schema Utilities** ([`utils/graphql.schema.utils.ts`](../utils/graphql.schema.utils.ts))
   - Remote schema fetching with retry logic
   - Schema validation
   - Remote executor creation

3. **Validation Utilities** ([`utils/graphql.validation.utils.ts`](../utils/graphql.validation.utils.ts))
   - Input validation
   - Parameter sanitization
   - Type checking

4. **Error Handling** ([`utils/graphql.error.utils.ts`](../utils/graphql.error.utils.ts))
   - Standardized error codes
   - Error formatting and sanitization
   - Error logging

5. **Configuration** ([`config/graphql.config.ts`](../config/graphql.config.ts))
   - Centralized configuration management
   - Environment variable overrides

## Features

### 1. Schema Stitching

The service combines a local schema with a remote metadata schema:

```typescript
// Local schema: Comic library operations
// Remote schema: Metadata provider operations (ComicVine, Metron, etc.)
```

**Benefits:**
- Single GraphQL endpoint for all operations
- Transparent federation of multiple data sources
- Graceful degradation if remote service is unavailable

### 2. Error Handling

Comprehensive error handling with standardized error codes:

```typescript
enum GraphQLErrorCode {
  BAD_REQUEST = "BAD_REQUEST",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
  TIMEOUT = "TIMEOUT",
  REMOTE_SCHEMA_ERROR = "REMOTE_SCHEMA_ERROR",
  // ... more codes
}
```

**Features:**
- Automatic error classification
- Safe error sanitization for clients
- Detailed logging for debugging
- Stack traces in development mode only

### 3. Retry Logic

Automatic retry for transient failures:

```typescript
{
  retries: 3,
  retryDelay: 2000, // Exponential backoff
  timeout: 10000
}
```

**Retryable Errors:**
- Network errors (ECONNREFUSED, ENOTFOUND)
- Timeout errors
- Service unavailable errors

### 4. Caching

Remote schema caching to reduce latency:

```typescript
{
  cacheEnabled: true,
  cacheTTL: 3600 // 1 hour
}
```

**Benefits:**
- Faster query execution
- Reduced load on remote service
- Configurable TTL

### 5. Health Monitoring

Periodic health checks for remote schema:

```typescript
{
  healthCheck: {
    enabled: true,
    interval: 60000 // 1 minute
  }
}
```

**Health Status:**
```json
{
  "healthy": true,
  "localSchema": true,
  "remoteSchema": true,
  "lastCheck": "2026-03-05T15:00:00.000Z",
  "remoteSchemaUrl": "http://localhost:3080/metadata-graphql"
}
```

### 6. Performance Monitoring

Query performance tracking:

```typescript
{
  logging: {
    logPerformance: true,
    slowQueryThreshold: 1000 // Log queries > 1s
  }
}
```

### 7. Input Validation

Comprehensive input validation:

- Pagination parameters (page, limit, offset)
- ID format validation (MongoDB ObjectId)
- Search query length limits
- File path sanitization
- JSON validation

### 8. Timeout Protection

Query execution timeouts:

```typescript
{
  execution: {
    timeout: 30000 // 30 seconds
  }
}
```

## Configuration

### Environment Variables

```bash
# Remote schema
METADATA_GRAPHQL_URL=http://localhost:3080/metadata-graphql
GRAPHQL_REMOTE_TIMEOUT=10000
GRAPHQL_REMOTE_RETRIES=3

# Execution
GRAPHQL_EXECUTION_TIMEOUT=30000
GRAPHQL_MAX_QUERY_DEPTH=10

# Caching
GRAPHQL_CACHE_ENABLED=true
GRAPHQL_CACHE_TTL=3600

# Environment
NODE_ENV=development
```

### Default Configuration

See [`config/graphql.config.ts`](../config/graphql.config.ts) for all configuration options.

## API Actions

### 1. Execute GraphQL Query

```typescript
broker.call("graphql.graphql", {
  query: "query { comic(id: \"123\") { id title } }",
  variables: {},
  operationName: "GetComic"
});
```

### 2. Get Schema

```typescript
broker.call("graphql.getSchema");
// Returns: { typeDefs: "...", hasRemoteSchema: true }
```

### 3. Health Check

```typescript
broker.call("graphql.health");
// Returns health status
```

### 4. Refresh Remote Schema

```typescript
broker.call("graphql.refreshRemoteSchema");
// Forces cache refresh
```

## Events

### 1. metadata.imported

Triggered when metadata is imported from external sources.

```typescript
broker.emit("metadata.imported", {
  comicId: "123",
  source: "COMICVINE"
});
```

**Auto-Resolution:**
If enabled in user preferences, automatically resolves canonical metadata.

### 2. comic.imported

Triggered when a new comic is imported.

```typescript
broker.emit("comic.imported", {
  comicId: "123"
});
```

**Auto-Resolution:**
If enabled in user preferences, automatically resolves canonical metadata on import.

## Error Handling Examples

### Client Errors (4xx)

```json
{
  "errors": [{
    "message": "Invalid ID format",
    "extensions": {
      "code": "VALIDATION_ERROR",
      "field": "id"
    }
  }]
}
```

### Server Errors (5xx)

```json
{
  "errors": [{
    "message": "Remote GraphQL service unavailable",
    "extensions": {
      "code": "SERVICE_UNAVAILABLE",
      "context": "Remote schema fetch"
    }
  }]
}
```

### Timeout Errors

```json
{
  "errors": [{
    "message": "Query execution timeout after 30000ms",
    "extensions": {
      "code": "TIMEOUT"
    }
  }]
}
```

## Best Practices

### 1. Query Optimization

- Use field selection to minimize data transfer
- Implement pagination for large result sets
- Avoid deeply nested queries (max depth: 10)

### 2. Error Handling

- Always check for errors in responses
- Handle specific error codes appropriately
- Log errors for debugging

### 3. Caching

- Use appropriate cache TTL for your use case
- Manually refresh cache when needed
- Monitor cache hit rates

### 4. Monitoring

- Enable health checks in production
- Monitor slow query logs
- Set up alerts for service unavailability

## Troubleshooting

### Remote Schema Connection Issues

**Problem:** Cannot connect to remote metadata service

**Solutions:**
1. Check `METADATA_GRAPHQL_URL` environment variable
2. Verify remote service is running
3. Check network connectivity
4. Review firewall rules

**Fallback:** Service continues with local schema only

### Slow Queries

**Problem:** Queries taking too long

**Solutions:**
1. Check slow query logs
2. Optimize resolver implementations
3. Add database indexes
4. Implement field-level caching
5. Increase timeout if necessary

### Memory Issues

**Problem:** High memory usage

**Solutions:**
1. Reduce cache TTL
2. Disable remote schema caching
3. Implement query complexity limits
4. Add pagination to large queries

### Schema Validation Errors

**Problem:** Schema validation fails

**Solutions:**
1. Check typedef syntax
2. Verify resolver implementations
3. Ensure all types are defined
4. Check for circular dependencies

## Migration Guide

### From Old Implementation

The refactored service maintains backward compatibility with the existing API:

1. **No breaking changes** to GraphQL schema
2. **Same action names** (`graphql.graphql`, `graphql.getSchema`)
3. **Same event handlers** (`metadata.imported`, `comic.imported`)

### New Features

1. **Health endpoint:** `broker.call("graphql.health")`
2. **Schema refresh:** `broker.call("graphql.refreshRemoteSchema")`
3. **Enhanced error messages** with error codes
4. **Performance logging** for slow queries

### Configuration Changes

Old configuration (environment variables only):
```bash
METADATA_GRAPHQL_URL=http://localhost:3080/metadata-graphql
```

New configuration (with defaults):
```bash
# All old variables still work
METADATA_GRAPHQL_URL=http://localhost:3080/metadata-graphql

# New optional variables
GRAPHQL_REMOTE_TIMEOUT=10000
GRAPHQL_CACHE_ENABLED=true
GRAPHQL_EXECUTION_TIMEOUT=30000
```

## Testing

### Unit Tests

```typescript
// Test schema initialization
describe("GraphQL Service", () => {
  it("should initialize local schema", async () => {
    const schema = await service.initializeLocalSchema();
    expect(schema).toBeDefined();
  });

  it("should handle remote schema failure gracefully", async () => {
    // Mock remote schema failure
    const schema = await service.started();
    expect(schema).toBe(localSchema);
  });
});
```

### Integration Tests

```typescript
// Test query execution
describe("GraphQL Queries", () => {
  it("should execute comic query", async () => {
    const result = await broker.call("graphql.graphql", {
      query: "query { comic(id: \"123\") { id title } }"
    });
    expect(result.data).toBeDefined();
  });
});
```

## Performance Benchmarks

Typical performance metrics:

- **Local query:** 10-50ms
- **Remote query:** 100-500ms (depending on network)
- **Stitched query:** 150-600ms
- **Cached remote schema:** +0ms overhead

## Security Considerations

1. **Query Depth Limiting:** Prevents deeply nested queries (DoS protection)
2. **Query Length Limiting:** Prevents excessively large queries
3. **Input Sanitization:** Removes control characters and validates formats
4. **Error Sanitization:** Hides sensitive information in production
5. **Timeout Protection:** Prevents long-running queries from blocking

## Future Enhancements

1. **Query Complexity Analysis:** Calculate and limit query complexity
2. **Rate Limiting:** Per-client rate limiting
3. **Persisted Queries:** Pre-approved query whitelist
4. **DataLoader Integration:** Batch and cache database queries
5. **Subscription Support:** Real-time updates via WebSocket
6. **Field-Level Caching:** Cache individual field results
7. **Distributed Tracing:** OpenTelemetry integration

## Support

For issues or questions:
1. Check this documentation
2. Review error logs
3. Check health endpoint
4. Review configuration
5. Open an issue on GitHub
