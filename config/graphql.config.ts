/**
 * @fileoverview GraphQL service configuration module
 * @module config/graphql.config
 * @description Provides configuration interfaces and defaults for the GraphQL service,
 * including remote schema settings, execution parameters, validation rules, logging options,
 * and health check configuration.
 */

/**
 * GraphQL service configuration interface
 * @interface GraphQLConfig
 * @description Complete configuration object for the GraphQL service with all subsections
 */
export interface GraphQLConfig {
	/**
	 * Remote schema configuration
	 * @property {boolean} enabled - Whether remote schema stitching is enabled
	 * @property {string} url - URL of the remote GraphQL endpoint
	 * @property {number} timeout - Request timeout in milliseconds
	 * @property {number} retries - Number of retry attempts for failed requests
	 * @property {number} retryDelay - Delay between retries in milliseconds
	 * @property {boolean} cacheEnabled - Whether to cache the remote schema
	 * @property {number} cacheTTL - Cache time-to-live in seconds
	 */
	remoteSchema: {
		enabled: boolean;
		url: string;
		timeout: number;
		retries: number;
		retryDelay: number;
		cacheEnabled: boolean;
		cacheTTL: number;
	};

	/**
	 * Query execution configuration
	 * @property {number} timeout - Maximum query execution time in milliseconds
	 * @property {number} maxDepth - Maximum allowed query depth
	 * @property {number} maxComplexity - Maximum allowed query complexity score
	 */
	execution: {
		timeout: number;
		maxDepth: number;
		maxComplexity: number;
	};

	/**
	 * Validation configuration
	 * @property {number} maxQueryLength - Maximum allowed query string length
	 * @property {number} maxBatchSize - Maximum number of operations in a batch
	 * @property {boolean} enableIntrospection - Whether to allow schema introspection
	 */
	validation: {
		maxQueryLength: number;
		maxBatchSize: number;
		enableIntrospection: boolean;
	};

	/**
	 * Logging configuration
	 * @property {boolean} logQueries - Whether to log all GraphQL queries
	 * @property {boolean} logErrors - Whether to log errors
	 * @property {boolean} logPerformance - Whether to log performance metrics
	 * @property {number} slowQueryThreshold - Threshold in milliseconds for slow query warnings
	 */
	logging: {
		logQueries: boolean;
		logErrors: boolean;
		logPerformance: boolean;
		slowQueryThreshold: number;
	};

	/**
	 * Health check configuration
	 * @property {boolean} enabled - Whether periodic health checks are enabled
	 * @property {number} interval - Health check interval in milliseconds
	 */
	healthCheck: {
		enabled: boolean;
		interval: number;
	};
}

/**
 * Default GraphQL configuration with sensible defaults
 * @constant {GraphQLConfig}
 * @description Provides default configuration values, with environment variable overrides
 * for remote schema URL and introspection settings
 */
export const defaultGraphQLConfig: GraphQLConfig = {
	remoteSchema: {
		enabled: true,
		url: process.env.METADATA_GRAPHQL_URL || "http://localhost:3080/metadata-graphql",
		timeout: 10000,
		retries: 3,
		retryDelay: 2000,
		cacheEnabled: true,
		cacheTTL: 3600, // 1 hour
	},

	execution: {
		timeout: 30000,
		maxDepth: 10,
		maxComplexity: 1000,
	},

	validation: {
		maxQueryLength: 10000,
		maxBatchSize: 100,
		enableIntrospection: process.env.NODE_ENV !== "production",
	},

	logging: {
		logQueries: process.env.NODE_ENV === "development",
		logErrors: true,
		logPerformance: true,
		slowQueryThreshold: 1000,
	},

	healthCheck: {
		enabled: true,
		interval: 60000, // 1 minute
	},
};

/**
 * Get GraphQL configuration with environment variable overrides
 * @function getGraphQLConfig
 * @returns {GraphQLConfig} Complete GraphQL configuration object
 * @description Merges default configuration with environment variable overrides.
 * Supports the following environment variables:
 * - `METADATA_GRAPHQL_URL`: Remote schema URL
 * - `GRAPHQL_REMOTE_TIMEOUT`: Remote schema timeout (ms)
 * - `GRAPHQL_REMOTE_RETRIES`: Number of retry attempts
 * - `GRAPHQL_EXECUTION_TIMEOUT`: Query execution timeout (ms)
 * - `GRAPHQL_MAX_QUERY_DEPTH`: Maximum query depth
 * - `GRAPHQL_CACHE_ENABLED`: Enable/disable schema caching ("true"/"false")
 * - `GRAPHQL_CACHE_TTL`: Cache TTL in seconds
 * - `NODE_ENV`: Affects introspection and logging defaults
 * 
 * @example
 * ```typescript
 * const config = getGraphQLConfig();
 * console.log(config.remoteSchema.url); // "http://localhost:3080/metadata-graphql"
 * ```
 */
export function getGraphQLConfig(): GraphQLConfig {
	const config = { ...defaultGraphQLConfig };

	// Override with environment variables if present
	if (process.env.GRAPHQL_REMOTE_TIMEOUT) {
		config.remoteSchema.timeout = parseInt(process.env.GRAPHQL_REMOTE_TIMEOUT, 10);
	}

	if (process.env.GRAPHQL_REMOTE_RETRIES) {
		config.remoteSchema.retries = parseInt(process.env.GRAPHQL_REMOTE_RETRIES, 10);
	}

	if (process.env.GRAPHQL_EXECUTION_TIMEOUT) {
		config.execution.timeout = parseInt(process.env.GRAPHQL_EXECUTION_TIMEOUT, 10);
	}

	if (process.env.GRAPHQL_MAX_QUERY_DEPTH) {
		config.execution.maxDepth = parseInt(process.env.GRAPHQL_MAX_QUERY_DEPTH, 10);
	}

	if (process.env.GRAPHQL_CACHE_ENABLED) {
		config.remoteSchema.cacheEnabled = process.env.GRAPHQL_CACHE_ENABLED === "true";
	}

	if (process.env.GRAPHQL_CACHE_TTL) {
		config.remoteSchema.cacheTTL = parseInt(process.env.GRAPHQL_CACHE_TTL, 10);
	}

	return config;
}
