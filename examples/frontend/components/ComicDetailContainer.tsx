/**
 * ComicDetailContainer - GraphQL Version
 * 
 * This file should replace the existing ComicDetailContainer.tsx
 * Location: src/client/components/ComicDetail/ComicDetailContainer.tsx
 * 
 * Key changes from REST version:
 * 1. Uses executeGraphQLQuery instead of axios directly
 * 2. Parses JSON strings from sourcedMetadata
 * 3. Maps GraphQL 'id' to REST '_id' for backward compatibility
 * 4. Better error and loading states
 */

import React, { ReactElement } from "react";
import { useParams } from "react-router-dom";
import { ComicDetail } from "../ComicDetail/ComicDetail";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { executeGraphQLQuery, transformComicToRestFormat } from "../../services/api/GraphQLApi";
import { 
  GET_COMIC_DETAIL_QUERY, 
  ComicDetailQueryResponse 
} from "../../graphql/queries/comicDetail";

export const ComicDetailContainer = (): ReactElement | null => {
  const { comicObjectId } = useParams<{ comicObjectId: string }>();
  const queryClient = useQueryClient();
  
  const {
    data: comicBookDetailData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["comicBookMetadata", comicObjectId],
    queryFn: async () => {
      // Execute GraphQL query
      const result = await executeGraphQLQuery<ComicDetailQueryResponse>(
        GET_COMIC_DETAIL_QUERY,
        { id: comicObjectId }
      );
      
      // Transform to REST format for backward compatibility
      const transformedComic = transformComicToRestFormat(result.comic);
      
      // Return in the format expected by ComicDetail component
      return {
        data: transformedComic,
      };
    },
    enabled: !!comicObjectId, // Only run query if we have an ID
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    retry: 2, // Retry failed requests twice
  });

  if (isError) {
    return (
      <div className="mx-auto max-w-screen-xl px-4 py-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong className="font-bold">Error loading comic: </strong>
          <span className="block sm:inline">
            {error instanceof Error ? error.message : 'Unknown error'}
          </span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-screen-xl px-4 py-4">
        <div className="flex items-center justify-center">
          <div className="text-gray-500 dark:text-gray-400">
            Loading comic details...
          </div>
        </div>
      </div>
    );
  }

  return (
    comicBookDetailData?.data && (
      <ComicDetail
        data={comicBookDetailData.data}
        queryClient={queryClient}
        comicObjectId={comicObjectId}
      />
    )
  );
};

/**
 * Alternative implementation with feature flag for gradual rollout
 * Uncomment this version if you want to toggle between REST and GraphQL
 */
/*
export const ComicDetailContainer = (): ReactElement | null => {
  const { comicObjectId } = useParams<{ comicObjectId: string }>();
  const queryClient = useQueryClient();
  
  // Feature flag to toggle between REST and GraphQL
  const USE_GRAPHQL = import.meta.env.VITE_USE_GRAPHQL === 'true';
  
  const {
    data: comicBookDetailData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["comicBookMetadata", comicObjectId],
    queryFn: async () => {
      if (USE_GRAPHQL) {
        // GraphQL implementation
        const result = await executeGraphQLQuery<ComicDetailQueryResponse>(
          GET_COMIC_DETAIL_QUERY,
          { id: comicObjectId }
        );
        
        const transformedComic = transformComicToRestFormat(result.comic);
        
        return {
          data: transformedComic,
        };
      } else {
        // REST implementation (fallback)
        const response = await axios({
          url: `${LIBRARY_SERVICE_BASE_URI}/getComicBookById`,
          method: "POST",
          data: { id: comicObjectId },
        });
        
        return response;
      }
    },
    enabled: !!comicObjectId,
  });

  // ... rest of the component remains the same
};
*/
