/**
 * @fileoverview GraphQL input validation utilities
 * @module utils/graphql.validation.utils
 * @description Provides comprehensive validation utilities for GraphQL inputs including
 * pagination parameters, IDs, search queries, file paths, metadata sources, and JSON strings.
 * Includes custom ValidationError class and conversion to GraphQL errors.
 */

import { GraphQLError } from "graphql";

/**
 * Custom validation error class
 * @class ValidationError
 * @extends Error
 * @description Custom error class for validation failures with optional field and code information
 */
export class ValidationError extends Error {
	/**
	 * Create a validation error
	 * @param {string} message - Human-readable error message
	 * @param {string} [field] - The field that failed validation
	 * @param {string} [code='VALIDATION_ERROR'] - Error code for categorization
	 */
	constructor(
		message: string,
		public field?: string,
		public code: string = "VALIDATION_ERROR"
	) {
		super(message);
		this.name = "ValidationError";
	}
}

/**
 * Validate pagination parameters
 * @function validatePaginationParams
 * @param {Object} params - Pagination parameters to validate
 * @param {number} [params.page] - Page number (must be >= 1)
 * @param {number} [params.limit] - Items per page (must be 1-100)
 * @param {number} [params.offset] - Offset for cursor-based pagination (must be >= 0)
 * @throws {ValidationError} If any parameter is invalid
 * @returns {void}
 * @description Validates pagination parameters ensuring page is positive, limit is within
 * acceptable range (1-100), and offset is non-negative.
 * 
 * @example
 * ```typescript
 * validatePaginationParams({ page: 1, limit: 20 }); // OK
 * validatePaginationParams({ page: 0, limit: 20 }); // Throws ValidationError
 * validatePaginationParams({ limit: 150 }); // Throws ValidationError
 * ```
 */
export function validatePaginationParams(params: {
	page?: number;
	limit?: number;
	offset?: number;
}): void {
	const { page, limit, offset } = params;

	if (page !== undefined) {
		if (!Number.isInteger(page) || page < 1) {
			throw new ValidationError(
				"Page must be a positive integer",
				"page",
				"INVALID_PAGE"
			);
		}
	}

	if (limit !== undefined) {
		if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
			throw new ValidationError(
				"Limit must be between 1 and 100",
				"limit",
				"INVALID_LIMIT"
			);
		}
	}

	if (offset !== undefined) {
		if (!Number.isInteger(offset) || offset < 0) {
			throw new ValidationError(
				"Offset must be a non-negative integer",
				"offset",
				"INVALID_OFFSET"
			);
		}
	}
}

/**
 * Validate a MongoDB ObjectId
 * @function validateId
 * @param {string} id - The ID to validate
 * @param {string} [fieldName='id'] - Name of the field for error messages
 * @throws {ValidationError} If ID is invalid
 * @returns {void}
 * @description Validates that an ID is a string and matches MongoDB ObjectId format
 * (24 hexadecimal characters).
 * 
 * @example
 * ```typescript
 * validateId('507f1f77bcf86cd799439011'); // OK
 * validateId('invalid-id'); // Throws ValidationError
 * validateId('', 'comicId'); // Throws ValidationError with field 'comicId'
 * ```
 */
export function validateId(id: string, fieldName: string = "id"): void {
	if (!id || typeof id !== "string") {
		throw new ValidationError(
			`${fieldName} is required and must be a string`,
			fieldName,
			"INVALID_ID"
		);
	}

	// MongoDB ObjectId validation (24 hex characters)
	if (!/^[a-f\d]{24}$/i.test(id)) {
		throw new ValidationError(
			`${fieldName} must be a valid ObjectId`,
			fieldName,
			"INVALID_ID_FORMAT"
		);
	}
}

/**
 * Validate an array of MongoDB ObjectIds
 * @function validateIds
 * @param {string[]} ids - Array of IDs to validate
 * @param {string} [fieldName='ids'] - Name of the field for error messages
 * @throws {ValidationError} If array is invalid or contains invalid IDs
 * @returns {void}
 * @description Validates that the input is a non-empty array (max 100 items) and
 * all elements are valid MongoDB ObjectIds.
 * 
 * @example
 * ```typescript
 * validateIds(['507f1f77bcf86cd799439011', '507f191e810c19729de860ea']); // OK
 * validateIds([]); // Throws ValidationError (empty array)
 * validateIds(['invalid']); // Throws ValidationError (invalid ID)
 * ```
 */
export function validateIds(ids: string[], fieldName: string = "ids"): void {
	if (!Array.isArray(ids) || ids.length === 0) {
		throw new ValidationError(
			`${fieldName} must be a non-empty array`,
			fieldName,
			"INVALID_IDS"
		);
	}

	if (ids.length > 100) {
		throw new ValidationError(
			`${fieldName} cannot contain more than 100 items`,
			fieldName,
			"TOO_MANY_IDS"
		);
	}

	ids.forEach((id, index) => {
		try {
			validateId(id, `${fieldName}[${index}]`);
		} catch (error: any) {
			throw new ValidationError(
				`Invalid ID at index ${index}: ${error.message}`,
				fieldName,
				"INVALID_ID_IN_ARRAY"
			);
		}
	});
}

/**
 * Validate a search query string
 * @function validateSearchQuery
 * @param {string} [query] - Search query to validate
 * @throws {ValidationError} If query is invalid
 * @returns {void}
 * @description Validates that a search query is a string and doesn't exceed 500 characters.
 * Undefined or null values are allowed (optional search).
 * 
 * @example
 * ```typescript
 * validateSearchQuery('Batman'); // OK
 * validateSearchQuery(undefined); // OK (optional)
 * validateSearchQuery('a'.repeat(501)); // Throws ValidationError (too long)
 * ```
 */
export function validateSearchQuery(query?: string): void {
	if (query !== undefined && query !== null) {
		if (typeof query !== "string") {
			throw new ValidationError(
				"Search query must be a string",
				"query",
				"INVALID_QUERY"
			);
		}

		if (query.length > 500) {
			throw new ValidationError(
				"Search query cannot exceed 500 characters",
				"query",
				"QUERY_TOO_LONG"
			);
		}
	}
}

/**
 * Validate a confidence threshold value
 * @function validateConfidenceThreshold
 * @param {number} [threshold] - Confidence threshold to validate (0-1)
 * @throws {ValidationError} If threshold is invalid
 * @returns {void}
 * @description Validates that a confidence threshold is a number between 0 and 1 inclusive.
 * Undefined values are allowed (optional threshold).
 * 
 * @example
 * ```typescript
 * validateConfidenceThreshold(0.8); // OK
 * validateConfidenceThreshold(undefined); // OK (optional)
 * validateConfidenceThreshold(1.5); // Throws ValidationError (out of range)
 * validateConfidenceThreshold('0.8'); // Throws ValidationError (not a number)
 * ```
 */
export function validateConfidenceThreshold(threshold?: number): void {
	if (threshold !== undefined) {
		if (typeof threshold !== "number" || isNaN(threshold)) {
			throw new ValidationError(
				"Confidence threshold must be a number",
				"minConfidenceThreshold",
				"INVALID_THRESHOLD"
			);
		}

		if (threshold < 0 || threshold > 1) {
			throw new ValidationError(
				"Confidence threshold must be between 0 and 1",
				"minConfidenceThreshold",
				"THRESHOLD_OUT_OF_RANGE"
			);
		}
	}
}

/**
 * Sanitize a string input by removing control characters and limiting length
 * @function sanitizeString
 * @param {string} input - String to sanitize
 * @param {number} [maxLength=1000] - Maximum allowed length
 * @returns {string} Sanitized string
 * @description Removes null bytes and control characters, trims whitespace,
 * and truncates to maximum length. Non-string inputs return empty string.
 * 
 * @example
 * ```typescript
 * sanitizeString('  Hello\x00World  '); // 'HelloWorld'
 * sanitizeString('a'.repeat(2000), 100); // 'aaa...' (100 chars)
 * sanitizeString(123); // '' (non-string)
 * ```
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
	if (typeof input !== "string") {
		return "";
	}

	// Remove null bytes and control characters
	let sanitized = input.replace(/[\x00-\x1F\x7F]/g, "");

	// Trim whitespace
	sanitized = sanitized.trim();

	// Truncate to max length
	if (sanitized.length > maxLength) {
		sanitized = sanitized.substring(0, maxLength);
	}

	return sanitized;
}

/**
 * Convert a validation error to a GraphQL error
 * @function toGraphQLError
 * @param {Error} error - Error to convert
 * @returns {GraphQLError} GraphQL-formatted error
 * @description Converts ValidationError instances to GraphQL errors with proper
 * extensions. Other errors are converted to generic GraphQL errors.
 * 
 * @example
 * ```typescript
 * try {
 *   validateId('invalid');
 * } catch (error) {
 *   throw toGraphQLError(error);
 * }
 * ```
 */
export function toGraphQLError(error: Error): GraphQLError {
	if (error instanceof ValidationError) {
		return new GraphQLError(error.message, {
			extensions: {
				code: error.code,
				field: error.field,
			},
		});
	}

	return new GraphQLError(error.message, {
		extensions: {
			code: "INTERNAL_SERVER_ERROR",
		},
	});
}

/**
 * Validate a file path for security and correctness
 * @function validateFilePath
 * @param {string} filePath - File path to validate
 * @throws {ValidationError} If file path is invalid or unsafe
 * @returns {void}
 * @description Validates file paths to prevent path traversal attacks and ensure
 * reasonable length. Rejects paths containing ".." or "~" and paths exceeding 4096 characters.
 * 
 * @example
 * ```typescript
 * validateFilePath('/comics/batman.cbz'); // OK
 * validateFilePath('../../../etc/passwd'); // Throws ValidationError (path traversal)
 * validateFilePath('~/comics/file.cbz'); // Throws ValidationError (tilde expansion)
 * ```
 */
export function validateFilePath(filePath: string): void {
	if (!filePath || typeof filePath !== "string") {
		throw new ValidationError(
			"File path is required and must be a string",
			"filePath",
			"INVALID_FILE_PATH"
		);
	}

	// Check for path traversal attempts
	if (filePath.includes("..") || filePath.includes("~")) {
		throw new ValidationError(
			"File path contains invalid characters",
			"filePath",
			"UNSAFE_FILE_PATH"
		);
	}

	if (filePath.length > 4096) {
		throw new ValidationError(
			"File path is too long",
			"filePath",
			"FILE_PATH_TOO_LONG"
		);
	}
}

/**
 * Validate a metadata source value
 * @function validateMetadataSource
 * @param {string} source - Metadata source to validate
 * @throws {ValidationError} If source is not a valid metadata source
 * @returns {void}
 * @description Validates that a metadata source is one of the allowed values:
 * COMICVINE, METRON, GRAND_COMICS_DATABASE, LOCG, COMICINFO_XML, or MANUAL.
 * 
 * @example
 * ```typescript
 * validateMetadataSource('COMICVINE'); // OK
 * validateMetadataSource('INVALID_SOURCE'); // Throws ValidationError
 * ```
 */
export function validateMetadataSource(source: string): void {
	const validSources = [
		"COMICVINE",
		"METRON",
		"GRAND_COMICS_DATABASE",
		"LOCG",
		"COMICINFO_XML",
		"MANUAL",
	];

	if (!validSources.includes(source)) {
		throw new ValidationError(
			`Invalid metadata source. Must be one of: ${validSources.join(", ")}`,
			"source",
			"INVALID_METADATA_SOURCE"
		);
	}
}

/**
 * Validate a JSON string for correctness and size
 * @function validateJSONString
 * @param {string} jsonString - JSON string to validate
 * @param {string} [fieldName='metadata'] - Name of the field for error messages
 * @throws {ValidationError} If JSON is invalid or too large
 * @returns {void}
 * @description Validates that a string is valid JSON and doesn't exceed 1MB in size.
 * Checks for proper JSON syntax and enforces size limits to prevent memory issues.
 * 
 * @example
 * ```typescript
 * validateJSONString('{"title": "Batman"}'); // OK
 * validateJSONString('invalid json'); // Throws ValidationError (malformed)
 * validateJSONString('{"data": "' + 'x'.repeat(2000000) + '"}'); // Throws (too large)
 * ```
 */
export function validateJSONString(jsonString: string, fieldName: string = "metadata"): void {
	if (!jsonString || typeof jsonString !== "string") {
		throw new ValidationError(
			`${fieldName} must be a valid JSON string`,
			fieldName,
			"INVALID_JSON"
		);
	}

	try {
		JSON.parse(jsonString);
	} catch (error) {
		throw new ValidationError(
			`${fieldName} contains invalid JSON`,
			fieldName,
			"MALFORMED_JSON"
		);
	}

	if (jsonString.length > 1048576) { // 1MB limit
		throw new ValidationError(
			`${fieldName} exceeds maximum size of 1MB`,
			fieldName,
			"JSON_TOO_LARGE"
		);
	}
}
