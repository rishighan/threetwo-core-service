/**
 * GraphQL queries and mutations for import operations
 * @module examples/frontend/graphql-queries/importQueries
 */

/**
 * Query to get import statistics for a directory
 * Shows how many files are already imported vs. new files
 */
export const GET_IMPORT_STATISTICS = `
  query GetImportStatistics($directoryPath: String) {
    getImportStatistics(directoryPath: $directoryPath) {
      success
      directory
      stats {
        totalLocalFiles
        alreadyImported
        newFiles
        percentageImported
      }
    }
  }
`;

/**
 * Mutation to start a new full import
 * Imports all comics in the directory, skipping already imported files
 */
export const START_NEW_IMPORT = `
  mutation StartNewImport($sessionId: String!) {
    startNewImport(sessionId: $sessionId) {
      success
      message
      jobsQueued
    }
  }
`;

/**
 * Mutation to start an incremental import
 * Only imports new files not already in the database
 */
export const START_INCREMENTAL_IMPORT = `
  mutation StartIncrementalImport($sessionId: String!, $directoryPath: String) {
    startIncrementalImport(sessionId: $sessionId, directoryPath: $directoryPath) {
      success
      message
      stats {
        total
        alreadyImported
        newFiles
        queued
      }
    }
  }
`;

/**
 * Example usage with variables
 */
export const exampleUsage = {
  // Get import statistics
  getStatistics: {
    query: GET_IMPORT_STATISTICS,
    variables: {
      directoryPath: "/comics", // Optional, defaults to COMICS_DIRECTORY
    },
  },

  // Start new full import
  startNewImport: {
    query: START_NEW_IMPORT,
    variables: {
      sessionId: `import-${Date.now()}`,
    },
  },

  // Start incremental import
  startIncrementalImport: {
    query: START_INCREMENTAL_IMPORT,
    variables: {
      sessionId: `incremental-${Date.now()}`,
      directoryPath: "/comics", // Optional
    },
  },
};

/**
 * TypeScript types for the responses
 */
export interface ImportStatistics {
  success: boolean;
  directory: string;
  stats: {
    totalLocalFiles: number;
    alreadyImported: number;
    newFiles: number;
    percentageImported: string;
  };
}

export interface ImportJobResult {
  success: boolean;
  message: string;
  jobsQueued: number;
}

export interface IncrementalImportResult {
  success: boolean;
  message: string;
  stats: {
    total: number;
    alreadyImported: number;
    newFiles: number;
    queued: number;
  };
}
