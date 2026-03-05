/**
 * GraphQL queries for library operations
 * Examples for getComicBooks, getComicBookGroups, getLibraryStatistics, and searchIssue
 */

/**
 * Query to get comic books with pagination and filtering
 */
export const GET_COMIC_BOOKS = `
  query GetComicBooks($paginationOptions: PaginationOptionsInput!, $predicate: PredicateInput) {
    getComicBooks(paginationOptions: $paginationOptions, predicate: $predicate) {
      docs {
        id
        canonicalMetadata {
          title {
            value
            provenance {
              source
              confidence
            }
          }
          series {
            value
          }
          issueNumber {
            value
          }
          publisher {
            value
          }
          coverImage {
            value
          }
        }
        rawFileDetails {
          name
          filePath
          fileSize
          extension
        }
        createdAt
        updatedAt
      }
      totalDocs
      limit
      page
      totalPages
      hasNextPage
      hasPrevPage
      nextPage
      prevPage
      pagingCounter
    }
  }
`;

/**
 * Query to get comic book groups (volumes)
 */
export const GET_COMIC_BOOK_GROUPS = `
  query GetComicBookGroups {
    getComicBookGroups {
      id
      volumes {
        id
        name
        count_of_issues
        publisher {
          id
          name
        }
        start_year
        image {
          medium_url
          thumb_url
        }
        description
        site_detail_url
      }
    }
  }
`;

/**
 * Query to get library statistics
 */
export const GET_LIBRARY_STATISTICS = `
  query GetLibraryStatistics {
    getLibraryStatistics {
      totalDocuments
      comicDirectorySize {
        totalSize
        totalSizeInMB
        totalSizeInGB
        fileCount
      }
      statistics {
        fileTypes {
          id
          data
        }
        publisherWithMostComicsInLibrary {
          id
          count
        }
      }
    }
  }
`;

/**
 * Example usage with variables for getComicBooks
 */
export const exampleGetComicBooksVariables = {
  paginationOptions: {
    page: 1,
    limit: 10,
    sort: "-createdAt", // Sort by creation date, descending
    lean: false,
    pagination: true,
  },
  predicate: {
    // Optional: Add filters here
    // Example: { "canonicalMetadata.publisher.value": "Marvel" }
  },
};

/**
 * Example: Get first page of comics
 */
export const exampleGetFirstPage = {
  query: GET_COMIC_BOOKS,
  variables: {
    paginationOptions: {
      page: 1,
      limit: 20,
      sort: "-createdAt",
    },
  },
};

/**
 * Example: Get comics with specific filters
 */
export const exampleGetFilteredComics = {
  query: GET_COMIC_BOOKS,
  variables: {
    paginationOptions: {
      page: 1,
      limit: 10,
    },
    predicate: {
      "importStatus.isImported": true,
    },
  },
};

/**
 * Query to search issues using Elasticsearch
 */
export const SEARCH_ISSUE = `
  query SearchIssue($query: SearchIssueQueryInput, $pagination: SearchPaginationInput, $type: SearchType!) {
    searchIssue(query: $query, pagination: $pagination, type: $type) {
      hits {
        total {
          value
          relation
        }
        max_score
        hits {
          _index
          _id
          _score
          _source {
            id
            canonicalMetadata {
              title {
                value
              }
              series {
                value
              }
              issueNumber {
                value
              }
              publisher {
                value
              }
            }
            rawFileDetails {
              name
              filePath
            }
          }
        }
      }
      took
      timed_out
    }
  }
`;

/**
 * Example: Search all comics
 */
export const exampleSearchAll = {
  query: SEARCH_ISSUE,
  variables: {
    type: "all",
    pagination: {
      size: 10,
      from: 0,
    },
  },
};

/**
 * Example: Search by volume name
 */
export const exampleSearchByVolumeName = {
  query: SEARCH_ISSUE,
  variables: {
    query: {
      volumeName: "Spider-Man",
    },
    type: "volumeName",
    pagination: {
      size: 20,
      from: 0,
    },
  },
};

/**
 * Example: Search wanted comics
 */
export const exampleSearchWanted = {
  query: SEARCH_ISSUE,
  variables: {
    type: "wanted",
    pagination: {
      size: 50,
      from: 0,
    },
  },
};

/**
 * Example: Search volumes
 */
export const exampleSearchVolumes = {
  query: SEARCH_ISSUE,
  variables: {
    type: "volumes",
    pagination: {
      size: 10,
      from: 0,
    },
  },
};
