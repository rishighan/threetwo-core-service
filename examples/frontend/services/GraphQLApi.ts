/**
 * GraphQL API Client Utility
 * 
 * This file should be placed in the frontend project at:
 * src/client/services/api/GraphQLApi.ts
 * 
 * Simple wrapper around axios for executing GraphQL queries and mutations
 * No additional dependencies needed (no Apollo Client)
 * Works seamlessly with React Query
 */

import axios from 'axios';

// Update this to match your frontend constants file
// import { LIBRARY_SERVICE_BASE_URI } from '../../constants/endpoints';
const LIBRARY_SERVICE_BASE_URI = process.env.REACT_APP_LIBRARY_SERVICE_BASE_URI || 'http://localhost:3000/api/library';

/**
 * Execute a GraphQL query against the threetwo-core-service GraphQL endpoint
 * 
 * @param query - GraphQL query string
 * @param variables - Query variables
 * @returns Promise with query result data
 * 
 * @example
 * ```typescript
 * const result = await executeGraphQLQuery<ComicDetailQueryResponse>(
 *   GET_COMIC_DETAIL_QUERY,
 *   { id: 'comic-id-123' }
 * );
 * console.log(result.comic.rawFileDetails.name);
 * ```
 */
export const executeGraphQLQuery = async <T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> => {
  try {
    const response = await axios.post(
      `${LIBRARY_SERVICE_BASE_URI}/graphql`,
      {
        query,
        variables,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    // GraphQL can return partial data with errors
    if (response.data.errors) {
      console.error('GraphQL errors:', response.data.errors);
      throw new Error(
        `GraphQL errors: ${response.data.errors.map((e: any) => e.message).join(', ')}`
      );
    }

    return response.data.data;
  } catch (error) {
    console.error('GraphQL query failed:', error);
    throw error;
  }
};

/**
 * Execute a GraphQL mutation against the threetwo-core-service GraphQL endpoint
 * 
 * @param mutation - GraphQL mutation string
 * @param variables - Mutation variables
 * @returns Promise with mutation result data
 * 
 * @example
 * ```typescript
 * const result = await executeGraphQLMutation<{ setMetadataField: Comic }>(
 *   SET_METADATA_FIELD_MUTATION,
 *   { comicId: '123', field: 'title', value: 'New Title' }
 * );
 * console.log(result.setMetadataField.canonicalMetadata.title);
 * ```
 */
export const executeGraphQLMutation = async <T = any>(
  mutation: string,
  variables?: Record<string, any>
): Promise<T> => {
  // Mutations use the same endpoint as queries
  return executeGraphQLQuery<T>(mutation, variables);
};

/**
 * Helper function to parse JSON strings from sourcedMetadata
 * GraphQL returns these fields as JSON strings that need parsing
 * 
 * @param sourcedMetadata - The sourcedMetadata object from GraphQL response
 * @returns Parsed sourcedMetadata with JSON fields converted to objects
 * 
 * @example
 * ```typescript
 * const comic = result.comic;
 * comic.sourcedMetadata = parseSourcedMetadata(comic.sourcedMetadata);
 * // Now comic.sourcedMetadata.comicInfo is an object, not a string
 * ```
 */
export const parseSourcedMetadata = (sourcedMetadata: any) => {
  if (!sourcedMetadata) return sourcedMetadata;

  const parsed = { ...sourcedMetadata };

  // Parse JSON strings
  if (parsed.comicInfo && typeof parsed.comicInfo === 'string') {
    try {
      parsed.comicInfo = JSON.parse(parsed.comicInfo);
    } catch (e) {
      console.warn('Failed to parse comicInfo:', e);
      parsed.comicInfo = {};
    }
  }

  if (parsed.comicvine && typeof parsed.comicvine === 'string') {
    try {
      parsed.comicvine = JSON.parse(parsed.comicvine);
    } catch (e) {
      console.warn('Failed to parse comicvine:', e);
      parsed.comicvine = {};
    }
  }

  if (parsed.metron && typeof parsed.metron === 'string') {
    try {
      parsed.metron = JSON.parse(parsed.metron);
    } catch (e) {
      console.warn('Failed to parse metron:', e);
      parsed.metron = {};
    }
  }

  if (parsed.gcd && typeof parsed.gcd === 'string') {
    try {
      parsed.gcd = JSON.parse(parsed.gcd);
    } catch (e) {
      console.warn('Failed to parse gcd:', e);
      parsed.gcd = {};
    }
  }

  return parsed;
};

/**
 * Helper function to transform GraphQL comic response to REST format
 * Ensures backward compatibility with existing components
 * 
 * @param comic - Comic object from GraphQL response
 * @returns Comic object in REST format with _id field
 */
export const transformComicToRestFormat = (comic: any) => {
  if (!comic) return null;

  return {
    _id: comic.id,
    ...comic,
    sourcedMetadata: parseSourcedMetadata(comic.sourcedMetadata),
  };
};
