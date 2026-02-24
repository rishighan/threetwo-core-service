import { gql } from "graphql-tag";

export const typeDefs = gql`
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

		# Get user preferences
		userPreferences(userId: String = "default"): UserPreferences

		# Analyze metadata conflicts for a comic
		analyzeMetadataConflicts(comicId: ID!): [MetadataConflict!]!

		# Preview canonical metadata resolution without saving
		previewCanonicalMetadata(
			comicId: ID!
			preferences: UserPreferencesInput
		): CanonicalMetadata
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
`;
