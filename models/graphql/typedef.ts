/**
 * @fileoverview GraphQL schema type definitions
 * @module models/graphql/typedef
 * @description Defines the complete GraphQL schema for the comic library management system.
 * Includes types for:
 * - Canonical metadata with provenance tracking
 * - Comic books with multi-source metadata
 * - User preferences for metadata resolution
 * - Library statistics and search functionality
 * - Mutations for metadata management and comic import
 *
 * The schema supports a sophisticated metadata resolution system that merges data from
 * multiple sources (ComicVine, Metron, ComicInfo.xml, etc.) with configurable priorities
 * and conflict resolution strategies.
 *
 * @see {@link module:models/graphql/resolvers} for resolver implementations
 * @see {@link module:utils/metadata.resolution.utils} for metadata resolution logic
 */

import { gql } from "graphql-tag";

/**
 * GraphQL schema type definitions
 * @constant {DocumentNode} typeDefs
 * @description Complete GraphQL schema including:
 *
 * **Core Types:**
 * - `Comic` - Main comic book type with canonical and sourced metadata
 * - `CanonicalMetadata` - Resolved metadata from multiple sources
 * - `SourcedMetadata` - Raw metadata from each source
 * - `UserPreferences` - User configuration for metadata resolution
 *
 * **Metadata Types:**
 * - `MetadataField` - Single field with provenance information
 * - `MetadataArrayField` - Array field with provenance
 * - `Provenance` - Source, confidence, and timestamp information
 * - `Creator` - Creator information with role and provenance
 *
 * **Enums:**
 * - `MetadataSource` - Available metadata sources
 * - `ConflictResolutionStrategy` - Strategies for resolving conflicts
 * - `SearchType` - Types of search operations
 *
 * **Queries:**
 * - `comic(id)` - Get single comic by ID
 * - `comics(...)` - List comics with pagination and filtering
 * - `getComicBooks(...)` - Advanced comic listing with predicates
 * - `getLibraryStatistics` - Library statistics and aggregations
 * - `searchIssue(...)` - Elasticsearch-powered search
 * - `userPreferences(userId)` - Get user preferences
 * - `analyzeMetadataConflicts(comicId)` - Analyze metadata conflicts
 * - `previewCanonicalMetadata(...)` - Preview resolution without saving
 *
 * **Mutations:**
 * - `updateUserPreferences(...)` - Update resolution preferences
 * - `setMetadataField(...)` - Manually override a field
 * - `resolveMetadata(comicId)` - Trigger metadata resolution
 * - `bulkResolveMetadata(comicIds)` - Bulk resolution
 * - `removeMetadataOverride(...)` - Remove manual override
 * - `importComic(input)` - Import new comic with auto-resolution
 * - `updateSourcedMetadata(...)` - Update source data and re-resolve
 *
 * @example
 * ```graphql
 * query GetComic {
 *   comic(id: "507f1f77bcf86cd799439011") {
 *     canonicalMetadata {
 *       title { value provenance { source confidence } }
 *       series { value provenance { source confidence } }
 *     }
 *   }
 * }
 * ```
 */
export const typeDefs = gql`
	# Arbitrary JSON scalar
	scalar JSON

	# Metadata source enumeration
	enum MetadataSource {
		COMICVINE
		METRON
		GRAND_COMICS_DATABASE
		LOCG
		COMICINFO_XML
		MANUAL
	}

	# Conflict resolution strategy
	enum ConflictResolutionStrategy {
		PRIORITY
		CONFIDENCE
		RECENCY
		MANUAL
		HYBRID
	}

	# Provenance information for metadata
	type Provenance {
		source: MetadataSource!
		sourceId: String
		confidence: Float!
		fetchedAt: String!
		url: String
	}

	# Metadata field with provenance
	type MetadataField {
		value: String
		provenance: Provenance!
		userOverride: Boolean
	}

	# Array metadata field with provenance
	type MetadataArrayField {
		values: [String!]!
		provenance: Provenance!
		userOverride: Boolean
	}

	# Creator with role and provenance
	type Creator {
		name: String!
		role: String!
		provenance: Provenance!
	}

	# Canonical metadata - resolved from multiple sources
	type CanonicalMetadata {
		# Core identifiers
		title: MetadataField
		series: MetadataField
		volume: MetadataField
		issueNumber: MetadataField

		# Publication info
		publisher: MetadataField
		publicationDate: MetadataField
		coverDate: MetadataField

		# Content
		description: MetadataField
		storyArcs: [MetadataField!]
		characters: [MetadataField!]
		teams: [MetadataField!]
		locations: [MetadataField!]

		# Creators
		creators: [Creator!]

		# Classification
		genres: [MetadataField!]
		tags: [MetadataField!]
		ageRating: MetadataField

		# Physical/Digital properties
		pageCount: MetadataField
		format: MetadataField

		# Ratings
		communityRating: MetadataField

		# Cover
		coverImage: MetadataField
	}

	# Raw file details
	type RawFileDetails {
		name: String
		filePath: String
		fileSize: Int
		extension: String
		mimeType: String
		containedIn: String
		pageCount: Int
		archive: Archive
		cover: Cover
	}

	type Archive {
		uncompressed: Boolean
		expandedPath: String
	}

	type Cover {
		filePath: String
		stats: String
	}

	# Import status
	type ImportStatus {
		isImported: Boolean
		tagged: Boolean
		isRawFileMissing: Boolean
		matchedResult: MatchedResult
	}

	type MatchedResult {
		score: String
	}

	# Main Comic type with canonical metadata
	type Comic {
		id: ID!
		
		# Canonical metadata (resolved from all sources)
		canonicalMetadata: CanonicalMetadata
		
		# Raw sourced metadata (for transparency)
		sourcedMetadata: SourcedMetadata
		
		# Inferred metadata (from filename parsing)
		inferredMetadata: InferredMetadata
		
		# File information
		rawFileDetails: RawFileDetails
		
		# Import status
		importStatus: ImportStatus
		
		# Timestamps
		createdAt: String
		updatedAt: String
	}

	# Sourced metadata (raw data from each source)
	type SourcedMetadata {
		comicInfo: String # JSON string
		comicvine: String # JSON string
		metron: String # JSON string
		gcd: String # JSON string
		locg: LOCGMetadata
	}

	type LOCGMetadata {
		name: String
		publisher: String
		url: String
		cover: String
		description: String
		price: String
		rating: Float
		pulls: Int
		potw: Int
	}

	# Source priority configuration
	type SourcePriority {
		source: MetadataSource!
		priority: Int!
		enabled: Boolean!
		fieldOverrides: [FieldOverride!]
	}

	type FieldOverride {
		field: String!
		priority: Int!
	}

	# User preferences for metadata resolution
	type UserPreferences {
		id: ID!
		userId: String!
		sourcePriorities: [SourcePriority!]!
		conflictResolution: ConflictResolutionStrategy!
		minConfidenceThreshold: Float!
		preferRecent: Boolean!
		fieldPreferences: [FieldPreference!]
		autoMerge: AutoMergeSettings!
		createdAt: String
		updatedAt: String
	}

	type FieldPreference {
		field: String!
		preferredSource: MetadataSource!
	}

	type AutoMergeSettings {
		enabled: Boolean!
		onImport: Boolean!
		onMetadataUpdate: Boolean!
	}

	# Pagination
	type ComicConnection {
		comics: [Comic!]!
		totalCount: Int!
		pageInfo: PageInfo!
	}

	type PageInfo {
		hasNextPage: Boolean!
		hasPreviousPage: Boolean!
		currentPage: Int!
		totalPages: Int!
	}

	# Metadata conflict information
	type MetadataConflict {
		field: String!
		candidates: [MetadataField!]!
		resolved: MetadataField
		resolutionReason: String!
	}

	# Queries
	type Query {
		# Get a single comic by ID
		comic(id: ID!): Comic

		# List comics with pagination and filtering
		comics(
			limit: Int = 10
			page: Int = 1
			search: String
			publisher: String
			series: String
		): ComicConnection!

		# Get comic books with advanced pagination and filtering
		getComicBooks(
			paginationOptions: PaginationOptionsInput!
			predicate: PredicateInput
		): ComicBooksResult!

		# Get comic book groups (volumes with multiple issues)
		getComicBookGroups: [ComicBookGroup!]!

		# Get library statistics
		getLibraryStatistics: LibraryStatistics!

		# Search issues using Elasticsearch
		searchIssue(
			query: SearchIssueQueryInput
			pagination: SearchPaginationInput
			type: SearchType!
		): SearchIssueResult!

		# Get user preferences
		userPreferences(userId: String = "default"): UserPreferences

		# Analyze metadata conflicts for a comic
		analyzeMetadataConflicts(comicId: ID!): [MetadataConflict!]!

		# Preview canonical metadata resolution without saving
		previewCanonicalMetadata(
			comicId: ID!
			preferences: UserPreferencesInput
		): CanonicalMetadata

		# Get import statistics for a directory
		getImportStatistics(directoryPath: String): ImportStatistics!

		# Get job result statistics grouped by session
		getJobResultStatistics: [JobResultStatistics!]!

		# Get active import session (if any)
		getActiveImportSession: ImportSession

		# Search ComicVine for volumes by name
		searchComicVine(searchTerms: String!, exactMatch: Boolean): ComicVineSearchResult!

		# Get all app settings (optionally filtered by key)
		settings(settingsKey: String): AppSettings

		# Get AirDC++ hubs for a given host
		hubs(host: HostInput!): [Hub!]!

		# Get AirDC++ bundles for a comic object
		bundles(comicObjectId: ID!, config: JSON): [Bundle!]!

		# Enqueue a repeating torrent data polling job
		torrentJobs(trigger: String!): TorrentJob

		# Search Prowlarr for torrents
		searchTorrents(query: String!): [TorrentSearchResult!]!

		# Walk a folder and return matching comic file paths
		walkFolders(basePathToWalk: String!, extensions: [String!]): [String!]!
	}

	# Mutations
	type Mutation {
		# Update user preferences
		updateUserPreferences(
			userId: String = "default"
			preferences: UserPreferencesInput!
		): UserPreferences!

		# Manually set a metadata field (creates user override)
		setMetadataField(
			comicId: ID!
			field: String!
			value: String!
		): Comic!

		# Trigger metadata resolution for a comic
		resolveMetadata(comicId: ID!): Comic!

		# Bulk resolve metadata for multiple comics
		bulkResolveMetadata(comicIds: [ID!]!): [Comic!]!

		# Remove user override for a field
		removeMetadataOverride(comicId: ID!, field: String!): Comic!

		# Refresh metadata from a specific source
		refreshMetadataFromSource(
			comicId: ID!
			source: MetadataSource!
		): Comic!

		# Import a new comic with automatic metadata resolution
		importComic(input: ImportComicInput!): ImportComicResult!

		# Update sourced metadata and trigger resolution
		updateSourcedMetadata(
			comicId: ID!
			source: MetadataSource!
			metadata: String!
		): Comic!

		# Start a new full import of the comics directory
		startNewImport(sessionId: String!): ImportJobResult!

		# Start an incremental import (only new files)
		startIncrementalImport(
			sessionId: String!
			directoryPath: String
		): IncrementalImportResult!

		# Force complete a stuck import session
		forceCompleteSession(sessionId: String!): ForceCompleteResult!

		# Apply a ComicVine volume match to a comic
		applyComicVineMatch(comicObjectId: ID!, match: ComicVineMatchInput!): Comic!

		# Analyze an image file for color and metadata
		analyzeImage(imageFilePath: String!): ImageAnalysisResult!

		# Uncompress an archive (enqueues background job)
		uncompressArchive(filePath: String!, comicObjectId: ID!, options: JSON): Boolean
	}

	# Input types
	input UserPreferencesInput {
		sourcePriorities: [SourcePriorityInput!]
		conflictResolution: ConflictResolutionStrategy
		minConfidenceThreshold: Float
		preferRecent: Boolean
		fieldPreferences: [FieldPreferenceInput!]
		autoMerge: AutoMergeSettingsInput
	}

	input SourcePriorityInput {
		source: MetadataSource!
		priority: Int!
		enabled: Boolean!
		fieldOverrides: [FieldOverrideInput!]
	}

	input FieldOverrideInput {
		field: String!
		priority: Int!
	}

	input FieldPreferenceInput {
		field: String!
		preferredSource: MetadataSource!
	}

	input AutoMergeSettingsInput {
		enabled: Boolean
		onImport: Boolean
		onMetadataUpdate: Boolean
	}

	# Import comic input
	input ImportComicInput {
		filePath: String!
		fileSize: Int
		sourcedMetadata: SourcedMetadataInput
		inferredMetadata: InferredMetadataInput
		rawFileDetails: RawFileDetailsInput
		wanted: WantedInput
		acquisition: AcquisitionInput
	}

	input SourcedMetadataInput {
		comicInfo: String
		comicvine: String
		metron: String
		gcd: String
		locg: LOCGMetadataInput
	}

	input LOCGMetadataInput {
		name: String
		publisher: String
		url: String
		cover: String
		description: String
		price: String
		rating: Float
		pulls: Int
		potw: Int
	}

	input InferredMetadataInput {
		issue: IssueInput
	}

	input IssueInput {
		name: String
		number: Int
		year: String
		subtitle: String
	}

	# Inferred metadata output type
	type InferredMetadata {
		issue: Issue
	}

	type Issue {
		name: String
		number: Int
		year: String
		subtitle: String
	}

	input RawFileDetailsInput {
		name: String!
		filePath: String!
		fileSize: Int
		extension: String
		mimeType: String
		containedIn: String
		pageCount: Int
		archive: ArchiveInput
		cover: CoverInput
	}

	input ArchiveInput {
		uncompressed: Boolean
		expandedPath: String
	}

	input CoverInput {
		filePath: String
		stats: String
	}

	input WantedInput {
		source: String
		markEntireVolumeWanted: Boolean
		issues: [WantedIssueInput!]
		volume: WantedVolumeInput
	}

	input WantedIssueInput {
		id: Int
		url: String
		image: [String!]
		coverDate: String
		issueNumber: String
	}

	input WantedVolumeInput {
		id: Int
		url: String
		image: [String!]
		name: String
	}

	input AcquisitionInput {
		source: AcquisitionSourceInput
		directconnect: DirectConnectInput
	}

	input AcquisitionSourceInput {
		wanted: Boolean
		name: String
	}

	input DirectConnectInput {
		downloads: [DirectConnectBundleInput!]
	}

	input DirectConnectBundleInput {
		bundleId: Int
		name: String
		size: String
	}

	# Import result
	type ImportComicResult {
		success: Boolean!
		comic: Comic
		message: String
		canonicalMetadataResolved: Boolean!
	}

	# Pagination options input
	input PaginationOptionsInput {
		page: Int
		limit: Int
		sort: String
		lean: Boolean
		leanWithId: Boolean
		offset: Int
		pagination: Boolean
	}

	# Predicate input for filtering
	# Note: This is a placeholder. In practice, predicates are passed as JSON objects
	# and handled dynamically in the resolver
	scalar PredicateInput

	# Comic books result with pagination
	type ComicBooksResult {
		docs: [Comic!]!
		totalDocs: Int!
		limit: Int!
		page: Int
		totalPages: Int!
		hasNextPage: Boolean!
		hasPrevPage: Boolean!
		nextPage: Int
		prevPage: Int
		pagingCounter: Int!
	}

	# Comic book group (volume with issues)
	type ComicBookGroup {
		id: ID!
		volumes: VolumeInfo
	}

	# Volume information
	type VolumeInfo {
		id: Int
		name: String
		count_of_issues: Int
		publisher: Publisher
		start_year: String
		image: VolumeImage
		description: String
		site_detail_url: String
	}

	# Publisher information
	type Publisher {
		id: Int
		name: String
		api_detail_url: String
	}

	# Volume image
	type VolumeImage {
		icon_url: String
		medium_url: String
		screen_url: String
		screen_large_url: String
		small_url: String
		super_url: String
		thumb_url: String
		tiny_url: String
		original_url: String
		image_tags: String
	}

	# Library statistics
	type LibraryStatistics {
		totalDocuments: Int!
		comicDirectorySize: DirectorySize!
		statistics: [StatisticsFacet!]!
	}

	# Directory size information
	type DirectorySize {
		totalSize: Float!
		totalSizeInMB: Float!
		totalSizeInGB: Float!
		fileCount: Int!
	}

	# Statistics facet
	type StatisticsFacet {
		fileTypes: [FileTypeStats!]
		issues: [IssueStats!]
		fileLessComics: [Comic!]
		issuesWithComicInfoXML: [Comic!]
		publisherWithMostComicsInLibrary: [PublisherStats!]
	}

	# File type statistics
	type FileTypeStats {
		id: String!
		data: [ID!]!
	}

	# Issue statistics
	type IssueStats {
		id: VolumeInfo
		data: [ID!]!
	}

	# Publisher statistics
	type PublisherStats {
		id: String!
		count: Int!
	}
	# Search issue query input
	input SearchIssueQueryInput {
		volumeName: String
		issueNumber: String
	}

	# Search pagination input
	input SearchPaginationInput {
		size: Int
		from: Int
	}

	# Search type enum
	enum SearchType {
		all
		volumeName
		wanted
		volumes
	}

	# Search issue result
	type SearchIssueResult {
		hits: SearchHits!
		took: Int
		timed_out: Boolean
	}

	# Search hits
	type SearchHits {
		total: SearchTotal!
		max_score: Float
		hits: [SearchHit!]!
	}

	# Search total
	type SearchTotal {
		value: Int!
		relation: String!
	}

	# Search hit
	type SearchHit {
		_index: String!
		_id: String!
		_score: Float
		_source: Comic!
	}

	# Import statistics
	type ImportStatistics {
		success: Boolean!
		directory: String!
		stats: ImportStats!
	}

	type ImportStats {
		totalLocalFiles: Int!
		alreadyImported: Int!
		newFiles: Int!
		missingFiles: Int!
		percentageImported: String!
	}

	# Import job result
	type ImportJobResult {
		success: Boolean!
		message: String!
		jobsQueued: Int!
	}

	# Incremental import result
	type IncrementalImportResult {
		success: Boolean!
		message: String!
		stats: IncrementalImportStats!
	}

	type IncrementalImportStats {
		total: Int!
		alreadyImported: Int!
		newFiles: Int!
		queued: Int!
	}

	# Force complete session result
	type ForceCompleteResult {
		success: Boolean!
		message: String!
	}

	# Job result statistics
	type JobResultStatistics {
		sessionId: String!
		completedJobs: Int!
		failedJobs: Int!
		earliestTimestamp: String!
	}

	# Import session information
	type ImportSession {
		sessionId: String!
		type: String!
		status: String!
		startedAt: String!
		completedAt: String
		stats: ImportSessionStats!
		directoryPath: String
	}

	type ImportSessionStats {
		totalFiles: Int!
		filesQueued: Int!
		filesProcessed: Int!
		filesSucceeded: Int!
		filesFailed: Int!
	}

	# Host configuration (used by AirDC++, bittorrent, prowlarr)
	type HostConfig {
		hostname: String
		port: String
		protocol: String
		username: String
		password: String
	}

	input HostInput {
		hostname: String!
		port: String!
		protocol: String!
		username: String!
		password: String!
	}

	# App settings
	type DirectConnectClient {
		host: HostConfig
		airDCPPUserSettings: JSON
		hubs: [JSON]
	}

	type DirectConnectSettings {
		client: DirectConnectClient
	}

	type BittorrentClient {
		name: String
		host: HostConfig
	}

	type BittorrentSettings {
		client: BittorrentClient
	}

	type ProwlarrClient {
		host: HostConfig
		apiKey: String
	}

	type ProwlarrSettings {
		client: ProwlarrClient
	}

	type AppSettings {
		directConnect: DirectConnectSettings
		bittorrent: BittorrentSettings
		prowlarr: ProwlarrSettings
	}

	# AirDC++ Hub
	type Hub {
		id: Int
		name: String
		description: String
		userCount: Int
	}

	# AirDC++ Bundle
	type Bundle {
		id: Int
		name: String
		size: String
		status: String
		speed: String
	}

	# Torrent search result (from Prowlarr)
	type TorrentSearchResult {
		title: String
		size: Float
		seeders: Int
		leechers: Int
		downloadUrl: String
		guid: String
		publishDate: String
		indexer: String
	}

	# Torrent job reference
	type TorrentJob {
		id: String
		name: String
	}

	# Image analysis result
	type ImageAnalysisResult {
		analyzedData: JSON
		colorHistogramData: JSON
	}

	# ComicVine volume search result
	type ComicVineVolume {
		id: Int
		name: String
		publisher: Publisher
		start_year: String
		count_of_issues: Int
		image: VolumeImage
		api_detail_url: String
		site_detail_url: String
		description: String
	}

	type ComicVineSearchResult {
		results: [ComicVineVolume!]!
		total: Int!
		limit: Int
		offset: Int
	}

	# Input for applying a ComicVine match
	input ComicVineMatchInput {
		volume: ComicVineVolumeRefInput!
		volumeInformation: JSON
	}

	input ComicVineVolumeRefInput {
		api_detail_url: String!
	}

`;
