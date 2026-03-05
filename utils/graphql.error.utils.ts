/**
 * @fileoverview GraphQL error handling utilities
 * @module utils/graphql.error.utils
 * @description Provides comprehensive error handling utilities for GraphQL operations,
 * including standardized error codes, error creation, error transformation, logging,
 * and error sanitization for client responses.
 */

import { GraphQLError } from "graphql";

/**
 * Standardized error codes for GraphQL operations
 * @enum {string}
 * @description Comprehensive set of error codes covering client errors (4xx),
 * server errors (5xx), GraphQL-specific errors, remote schema errors, and database errors.
 */
export enum GraphQLErrorCode {
	// Client errors (4xx)
	/** Bad request - malformed or invalid request */
	BAD_REQUEST = "BAD_REQUEST",
	/** Unauthorized - authentication required */
	UNAUTHORIZED = "UNAUTHORIZED",
	/** Forbidden - insufficient permissions */
	FORBIDDEN = "FORBIDDEN",
	/** Not found - requested resource doesn't exist */
	NOT_FOUND = "NOT_FOUND",
	/** Validation error - input validation failed */
	VALIDATION_ERROR = "VALIDATION_ERROR",
	
	// Server errors (5xx)
	/** Internal server error - unexpected server-side error */
	INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
	/** Service unavailable - service is temporarily unavailable */
	SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
	/** Timeout - operation exceeded time limit */
	TIMEOUT = "TIMEOUT",
	
	// GraphQL specific
	/** GraphQL parse failed - query syntax error */
	GRAPHQL_PARSE_FAILED = "GRAPHQL_PARSE_FAILED",
	/** GraphQL validation failed - query validation error */
	GRAPHQL_VALIDATION_FAILED = "GRAPHQL_VALIDATION_FAILED",
	
	// Remote schema errors
	/** Remote schema error - error from remote GraphQL service */
	REMOTE_SCHEMA_ERROR = "REMOTE_SCHEMA_ERROR",
	/** Remote schema unavailable - cannot connect to remote schema */
	REMOTE_SCHEMA_UNAVAILABLE = "REMOTE_SCHEMA_UNAVAILABLE",
	
	// Database errors
	/** Database error - database operation failed */
	DATABASE_ERROR = "DATABASE_ERROR",
	/** Document not found - requested document doesn't exist */
	DOCUMENT_NOT_FOUND = "DOCUMENT_NOT_FOUND",
}

/**
 * Create a standardized GraphQL error with consistent formatting
 * @function createGraphQLError
 * @param {string} message - Human-readable error message
 * @param {GraphQLErrorCode} [code=INTERNAL_SERVER_ERROR] - Error code from GraphQLErrorCode enum
 * @param {Record<string, any>} [extensions] - Additional error metadata
 * @returns {GraphQLError} Formatted GraphQL error object
 * @description Creates a GraphQL error with standardized structure including error code
 * and optional extensions. The error code is automatically added to extensions.
 * 
 * @example
 * ```typescript
 * throw createGraphQLError(
 *   'Comic not found',
 *   GraphQLErrorCode.NOT_FOUND,
 *   { comicId: '123' }
 * );
 * ```
 */
export function createGraphQLError(
	message: string,
	code: GraphQLErrorCode = GraphQLErrorCode.INTERNAL_SERVER_ERROR,
	extensions?: Record<string, any>
): GraphQLError {
	return new GraphQLError(message, {
		extensions: {
			code,
			...extensions,
		},
	});
}

/**
 * Handle and format errors for GraphQL responses
 * @function handleGraphQLError
 * @param {any} error - The error to handle (can be any type)
 * @param {string} [context] - Optional context string describing where the error occurred
 * @returns {GraphQLError} Formatted GraphQL error
 * @description Transforms various error types into standardized GraphQL errors.
 * Handles MongoDB errors (CastError, ValidationError, DocumentNotFoundError),
 * timeout errors, network errors, and generic errors. Already-formatted GraphQL
 * errors are returned as-is.
 * 
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   throw handleGraphQLError(error, 'someOperation');
 * }
 * ```
 */
export function handleGraphQLError(error: any, context?: string): GraphQLError {
	// If it's already a GraphQL error, return it
	if (error instanceof GraphQLError) {
		return error;
	}

	// Handle MongoDB errors
	if (error.name === "CastError") {
		return createGraphQLError(
			"Invalid ID format",
			GraphQLErrorCode.VALIDATION_ERROR,
			{ field: error.path }
		);
	}

	if (error.name === "ValidationError") {
		return createGraphQLError(
			`Validation failed: ${error.message}`,
			GraphQLErrorCode.VALIDATION_ERROR
		);
	}

	if (error.name === "DocumentNotFoundError") {
		return createGraphQLError(
			"Document not found",
			GraphQLErrorCode.DOCUMENT_NOT_FOUND
		);
	}

	// Handle timeout errors
	if (error.name === "TimeoutError" || error.message?.includes("timeout")) {
		return createGraphQLError(
			"Operation timed out",
			GraphQLErrorCode.TIMEOUT,
			{ context }
		);
	}

	// Handle network errors
	if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
		return createGraphQLError(
			"Service unavailable",
			GraphQLErrorCode.SERVICE_UNAVAILABLE,
			{ context }
		);
	}

	// Default error
	return createGraphQLError(
		context ? `${context}: ${error.message}` : error.message,
		GraphQLErrorCode.INTERNAL_SERVER_ERROR,
		{
			originalError: error.name,
			stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
		}
	);
}

/**
 * Wrap a resolver function with automatic error handling
 * @function withErrorHandling
 * @template T - The resolver function type
 * @param {T} resolver - The resolver function to wrap
 * @param {string} [context] - Optional context string for error messages
 * @returns {T} Wrapped resolver function with error handling
 * @description Higher-order function that wraps a resolver with try-catch error handling.
 * Automatically transforms errors using handleGraphQLError before re-throwing.
 * 
 * @example
 * ```typescript
 * const getComic = withErrorHandling(
 *   async (_, { id }) => {
 *     return await Comic.findById(id);
 *   },
 *   'getComic'
 * );
 * ```
 */
export function withErrorHandling<T extends (...args: any[]) => any>(
	resolver: T,
	context?: string
): T {
	return (async (...args: any[]) => {
		try {
			return await resolver(...args);
		} catch (error: any) {
			throw handleGraphQLError(error, context);
		}
	}) as T;
}

/**
 * Error logging context
 * @interface ErrorContext
 * @property {string} [operation] - Name of the GraphQL operation
 * @property {string} [query] - The GraphQL query string
 * @property {any} [variables] - Query variables
 * @property {string} [userId] - User ID if available
 */
interface ErrorContext {
	operation?: string;
	query?: string;
	variables?: any;
	userId?: string;
}

/**
 * Log error with structured context information
 * @function logError
 * @param {any} logger - Logger instance (e.g., Moleculer logger)
 * @param {Error} error - The error to log
 * @param {ErrorContext} context - Additional context for the error
 * @returns {void}
 * @description Logs errors with structured context including operation name, query,
 * variables, and user ID. Includes GraphQL error extensions if present.
 * 
 * @example
 * ```typescript
 * logError(this.logger, error, {
 *   operation: 'getComic',
 *   query: 'query { comic(id: "123") { title } }',
 *   variables: { id: '123' }
 * });
 * ```
 */
export function logError(
	logger: any,
	error: Error,
	context: ErrorContext
): void {
	const errorInfo: any = {
		message: error.message,
		name: error.name,
		stack: error.stack,
		...context,
	};

	if (error instanceof GraphQLError) {
		errorInfo.extensions = error.extensions;
	}

	logger.error("GraphQL Error:", errorInfo);
}

/**
 * Check if an error is retryable
 * @function isRetryableError
 * @param {any} error - The error to check
 * @returns {boolean} True if the error is retryable, false otherwise
 * @description Determines if an error represents a transient failure that could
 * succeed on retry. Returns true for network errors, timeout errors, and
 * service unavailable errors.
 * 
 * @example
 * ```typescript
 * if (isRetryableError(error)) {
 *   // Implement retry logic
 *   await retryOperation();
 * }
 * ```
 */
export function isRetryableError(error: any): boolean {
	// Network errors are retryable
	if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
		return true;
	}

	// Timeout errors are retryable
	if (error.name === "TimeoutError" || error.message?.includes("timeout")) {
		return true;
	}

	// Service unavailable errors are retryable
	if (error.extensions?.code === GraphQLErrorCode.SERVICE_UNAVAILABLE) {
		return true;
	}

	return false;
}

/**
 * Sanitize error for client response
 * @function sanitizeError
 * @param {GraphQLError} error - The GraphQL error to sanitize
 * @param {boolean} [includeStack=false] - Whether to include stack trace
 * @returns {any} Sanitized error object safe for client consumption
 * @description Sanitizes errors for client responses by removing sensitive information
 * and including only safe fields. Stack traces are only included if explicitly requested
 * (typically only in development environments).
 * 
 * @example
 * ```typescript
 * const sanitized = sanitizeError(
 *   error,
 *   process.env.NODE_ENV === 'development'
 * );
 * return { errors: [sanitized] };
 * ```
 */
export function sanitizeError(error: GraphQLError, includeStack: boolean = false): any {
	const sanitized: any = {
		message: error.message,
		extensions: {
			code: error.extensions?.code || GraphQLErrorCode.INTERNAL_SERVER_ERROR,
		},
	};

	// Include additional safe extensions
	if (error.extensions?.field) {
		sanitized.extensions.field = error.extensions.field;
	}

	if (error.extensions?.context) {
		sanitized.extensions.context = error.extensions.context;
	}

	// Include stack trace only in development
	if (includeStack && error.stack) {
		sanitized.extensions.stack = error.stack;
	}

	return sanitized;
}
