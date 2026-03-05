/**
 * GraphQL query to fetch complete comic detail data
 * 
 * This file should be placed in the frontend project at:
 * src/client/graphql/queries/comicDetail.ts
 * 
 * Matches the data structure expected by ComicDetail component
 */

export const GET_COMIC_DETAIL_QUERY = `
  query GetComicDetail($id: ID!) {
    comic(id: $id) {
      id
      
      # Raw file information
      rawFileDetails {
        name
        filePath
        fileSize
        extension
        mimeType
        containedIn
        pageCount
        archive {
          uncompressed
          expandedPath
        }
        cover {
          filePath
          stats
        }
      }
      
      # Inferred metadata from filename parsing
      inferredMetadata {
        issue {
          name
          number
          year
          subtitle
        }
      }
      
      # Sourced metadata from various providers
      sourcedMetadata {
        comicInfo
        comicvine
        metron
        gcd
        locg {
          name
          publisher
          url
          cover
          description
          price
          rating
          pulls
          potw
        }
      }
      
      # Import status
      importStatus {
        isImported
        tagged
        matchedResult {
          score
        }
      }
      
      # Acquisition/download information
      acquisition {
        source {
          wanted
          name
        }
        directconnect {
          downloads {
            bundleId
            name
            size
          }
        }
        torrent {
          infoHash
          name
          announce
        }
      }
      
      # Timestamps
      createdAt
      updatedAt
    }
  }
`;

/**
 * TypeScript type for the query response
 * Generated from GraphQL schema
 */
export interface ComicDetailQueryResponse {
  comic: {
    id: string;
    rawFileDetails?: {
      name?: string;
      filePath?: string;
      fileSize?: number;
      extension?: string;
      mimeType?: string;
      containedIn?: string;
      pageCount?: number;
      archive?: {
        uncompressed?: boolean;
        expandedPath?: string;
      };
      cover?: {
        filePath?: string;
        stats?: any;
      };
    };
    inferredMetadata?: {
      issue?: {
        name?: string;
        number?: number;
        year?: string;
        subtitle?: string;
      };
    };
    sourcedMetadata?: {
      comicInfo?: string; // JSON string - needs parsing
      comicvine?: string; // JSON string - needs parsing
      metron?: string; // JSON string - needs parsing
      gcd?: string; // JSON string - needs parsing
      locg?: {
        name?: string;
        publisher?: string;
        url?: string;
        cover?: string;
        description?: string;
        price?: string;
        rating?: number;
        pulls?: number;
        potw?: number;
      };
    };
    importStatus?: {
      isImported?: boolean;
      tagged?: boolean;
      matchedResult?: {
        score?: string;
      };
    };
    acquisition?: {
      source?: {
        wanted?: boolean;
        name?: string;
      };
      directconnect?: {
        downloads?: Array<{
          bundleId?: number;
          name?: string;
          size?: string;
        }>;
      };
      torrent?: Array<{
        infoHash?: string;
        name?: string;
        announce?: string[];
      }>;
    };
    createdAt?: string;
    updatedAt?: string;
  };
}

/**
 * Minimal query for basic comic information
 * Use this when you only need basic details
 */
export const GET_COMIC_BASIC_QUERY = `
  query GetComicBasic($id: ID!) {
    comic(id: $id) {
      id
      rawFileDetails {
        name
        filePath
        fileSize
        pageCount
      }
      inferredMetadata {
        issue {
          name
          number
          year
        }
      }
    }
  }
`;

/**
 * Query for comic metadata only (no file details)
 * Use this when you only need metadata
 */
export const GET_COMIC_METADATA_QUERY = `
  query GetComicMetadata($id: ID!) {
    comic(id: $id) {
      id
      sourcedMetadata {
        comicInfo
        comicvine
        metron
        gcd
        locg {
          name
          publisher
          description
          rating
        }
      }
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
          provenance {
            source
            confidence
          }
        }
        publisher {
          value
          provenance {
            source
            confidence
          }
        }
      }
    }
  }
`;
