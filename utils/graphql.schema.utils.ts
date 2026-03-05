/**
 * @fileoverview GraphQL schema utilities for remote schema fetching and validation
 * @module utils/graphql.schema.utils
 * @description Provides utilities for fetching remote GraphQL schemas via introspection,
 * creating remote executors for schema stitching, and validating GraphQL schemas.
 * Includes retry logic, timeout handling, and comprehensive error management.
 */

import { GraphQLSchema, getIntrospectionQuery, buildClientSchema, IntrospectionQuery } from "graphql";
import { print } from "graphql";
import { fetch } from "undici";

/**
 * Configuration for remote schema fetching
 * @interface RemoteSchemaConfig
 * @property {string} url - The URL of the remote GraphQL endpoint
 * @property {number} [timeout=10000] - Request timeout in milliseconds
 * @property {number} [retries=3] - Number of retry attempts for failed requests
 * @property {number} [retryDelay=2000] - Base delay between retries in milliseconds (uses exponential backoff)
 */
export interface RemoteSchemaConfig {
	url: string;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
}

/**
 * Result of a schema fetch operation
 * @interface SchemaFetchResult
 * @property {boolean} success - Whether the fetch operation succeeded
 * @property {GraphQLSchema} [schema] - The fetched GraphQL schema (present if success is true)
 * @property {Error} [error] - Error object if the fetch failed
 * @property {number} attempts - Number of attempts made before success or final failure
 */
export interface SchemaFetchResult {
	success: boolean;
	schema?: GraphQLSchema;
	error?: Error;
	attempts: number;
}

/**
 * Fetch remote GraphQL schema via introspection with retry logic
 * @async
 * @function fetchRemoteSchema
 * @param {RemoteSchemaConfig} config - Configuration for the remote schema fetch
 * @returns {Promise<SchemaFetchResult>} Result object containing schema or error
 * @description Fetches a GraphQL schema from a remote endpoint using introspection.
 * Implements exponential backoff retry logic and timeout handling. The function will
 * retry failed requests up to the specified number of times with increasing delays.
 * 
 * @example
 * ```typescript
 * const result = await fetchRemoteSchema({
 *   url: 'http://localhost:3080/graphql',
 *   timeout: 5000,
 *   retries: 3,
 *   retryDelay: 1000
 * });
 * 
 * if (result.success) {
 *   console.log('Schema fetched:', result.schema);
 * } else {
 *   console.error('Failed after', result.attempts, 'attempts:', result.error);
 * }
 * ```
 */
export async function fetchRemoteSchema(
	config: RemoteSchemaConfig
): Promise<SchemaFetchResult> {
	const {
		url,
		timeout = 10000,
		retries = 3,
		retryDelay = 2000,
	} = config;

	let lastError: Error | undefined;
	let attempts = 0;

	for (let attempt = 1; attempt <= retries; attempt++) {
		attempts = attempt;
		
		try {
			const introspectionQuery = getIntrospectionQuery();
			
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeout);

			try {
				const response = await fetch(url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ query: introspectionQuery }),
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					throw new Error(
						`HTTP ${response.status}: ${response.statusText}`
					);
				}

				const result = await response.json() as {
					data?: IntrospectionQuery;
					errors?: any[];
				};

				if (result.errors && result.errors.length > 0) {
					throw new Error(
						`Introspection errors: ${JSON.stringify(result.errors)}`
					);
				}

				if (!result.data) {
					throw new Error("No data returned from introspection query");
				}

				const schema = buildClientSchema(result.data);

				return {
					success: true,
					schema,
					attempts,
				};
			} catch (fetchError: any) {
				clearTimeout(timeoutId);
				
				if (fetchError.name === "AbortError") {
					throw new Error(`Request timeout after ${timeout}ms`);
				}
				throw fetchError;
			}
		} catch (error: any) {
			lastError = error;
			
			// Don't retry on the last attempt
			if (attempt < retries) {
				await sleep(retryDelay * attempt); // Exponential backoff
			}
		}
	}

	return {
		success: false,
		error: lastError || new Error("Unknown error during schema fetch"),
		attempts,
	};
}

/**
 * Create an executor function for remote GraphQL endpoint with error handling
 * @function createRemoteExecutor
 * @param {string} url - The URL of the remote GraphQL endpoint
 * @param {number} [timeout=30000] - Request timeout in milliseconds
 * @returns {Function} Executor function compatible with schema stitching
 * @description Creates an executor function that can be used with GraphQL schema stitching.
 * The executor handles query execution against a remote GraphQL endpoint, including
 * timeout handling and error formatting. Returns errors in GraphQL-compatible format.
 * 
 * @example
 * ```typescript
 * const executor = createRemoteExecutor('http://localhost:3080/graphql', 10000);
 * 
 * // Used in schema stitching:
 * const stitchedSchema = stitchSchemas({
 *   subschemas: [{
 *     schema: remoteSchema,
 *     executor: executor
 *   }]
 * });
 * ```
 */
export function createRemoteExecutor(url: string, timeout: number = 30000) {
	return async ({ document, variables, context }: any) => {
		const query = print(document);
		
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ query, variables }),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				return {
					errors: [
						{
							message: `Remote GraphQL request failed: ${response.statusText}`,
							extensions: {
								code: "REMOTE_ERROR",
								status: response.status,
							},
						},
					],
				};
			}

			return await response.json();
		} catch (error: any) {
			clearTimeout(timeoutId);
			
			const errorMessage = error.name === "AbortError"
				? `Remote request timeout after ${timeout}ms`
				: `Remote GraphQL execution error: ${error.message}`;

			return {
				errors: [
					{
						message: errorMessage,
						extensions: {
							code: error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
						},
					},
				],
			};
		}
	};
}

/**
 * Validation result for GraphQL schema
 * @interface ValidationResult
 * @property {boolean} valid - Whether the schema is valid
 * @property {string[]} errors - Array of validation error messages
 */
interface ValidationResult {
	valid: boolean;
	errors: string[];
}

/**
 * Validate a GraphQL schema for basic correctness
 * @function validateSchema
 * @param {GraphQLSchema} schema - The GraphQL schema to validate
 * @returns {ValidationResult} Validation result with status and any error messages
 * @description Performs basic validation on a GraphQL schema, checking for:
 * - Presence of a Query type
 * - At least one field in the Query type
 * Returns a result object indicating validity and any error messages.
 * 
 * @example
 * ```typescript
 * const validation = validateSchema(mySchema);
 * if (!validation.valid) {
 *   console.error('Schema validation failed:', validation.errors);
 * }
 * ```
 */
export function validateSchema(schema: GraphQLSchema): ValidationResult {
	const errors: string[] = [];

	try {
		// Check if schema has Query type
		const queryType = schema.getQueryType();
		if (!queryType) {
			errors.push("Schema must have a Query type");
		}

		// Check if schema has at least one field
		if (queryType && Object.keys(queryType.getFields()).length === 0) {
			errors.push("Query type must have at least one field");
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	} catch (error: any) {
		return {
			valid: false,
			errors: [`Schema validation error: ${error.message}`],
		};
	}
}

/**
 * Sleep utility for implementing retry delays
 * @private
 * @function sleep
 * @param {number} ms - Number of milliseconds to sleep
 * @returns {Promise<void>} Promise that resolves after the specified delay
 * @description Helper function that returns a promise which resolves after
 * the specified number of milliseconds. Used for implementing retry delays
 * with exponential backoff.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
