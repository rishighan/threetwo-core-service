/**
 * @fileoverview Comic Model - Mongoose schema for comic book metadata with multi-source provenance tracking
 *
 * This model implements a sophisticated metadata management system that:
 * - Tracks metadata from multiple sources (ComicVine, Metron, GCD, LOCG, ComicInfo XML)
 * - Maintains provenance (source tracking) for each piece of metadata
 * - Provides canonical metadata resolution from multiple sources
 * - Supports Elasticsearch integration for fast searching
 * - Maintains backward compatibility with legacy sourced metadata
 *
 * @module models/comic.model
 */

const paginate = require("mongoose-paginate-v2");
const { Client } = require("@elastic/elasticsearch");
import { mongoosastic } from "mongoosastic-ts";
const mongoose = require("mongoose");
import {
	MongoosasticDocument,
	MongoosasticModel,
	MongoosasticPluginOpts,
} from "mongoosastic-ts/dist/types";

/**
 * Elasticsearch host URL from environment or default
 * @type {string}
 * @constant
 */
const ELASTICSEARCH_HOST =
	process.env.ELASTICSEARCH_URI || "http://localhost:9200";
console.log(`ELASTICSEARCH -> ${ELASTICSEARCH_HOST}`);

/**
 * Elasticsearch client instance for comic indexing and searching
 * Configured with basic authentication for the Elasticsearch cluster
 *
 * @type {Client}
 * @constant
 */
export const eSClient = new Client({
	node: ELASTICSEARCH_HOST,
	auth: {
		username: "elastic",
		password: "password",
	},
});

/**
 * Metadata source enumeration
 * Defines all supported external metadata sources for comic information
 *
 * @enum {string}
 * @property {string} COMICVINE - Comic Vine API (comicvine.gamespot.com)
 * @property {string} METRON - Metron Comics Database
 * @property {string} GRAND_COMICS_DATABASE - Grand Comics Database (GCD)
 * @property {string} LOCG - League of Comic Geeks
 * @property {string} COMICINFO_XML - ComicInfo.xml embedded in comic archives
 * @property {string} MANUAL - User-entered metadata
 */
export enum MetadataSource {
	COMICVINE = "comicvine",
	METRON = "metron",
	GRAND_COMICS_DATABASE = "gcd",
	LOCG = "locg",
	COMICINFO_XML = "comicinfo",
	MANUAL = "manual",
}

/**
 * Provenance Schema
 * Tracks the source and origin of each piece of metadata
 *
 * This schema is embedded in all metadata fields to provide complete traceability
 * of where information came from, when it was fetched, and its confidence level.
 *
 * @typedef {Object} Provenance
 * @property {MetadataSource} source - The source system this metadata came from
 * @property {string} [sourceId] - External ID from the source (e.g., ComicVine ID "4000-12345")
 * @property {number} [confidence=1] - Confidence score from 0-1 indicating reliability of the metadata
 * @property {Date} [fetchedAt] - Timestamp when the metadata was retrieved from the source
 * @property {string} [url] - Direct URL to the source page if applicable
 */
const ProvenanceSchema = new mongoose.Schema(
	{
		_id: false,
		source: {
			type: String,
			enum: Object.values(MetadataSource),
			required: true,
		},
		sourceId: String, // External ID from the source (e.g., ComicVine ID)
		confidence: { type: Number, min: 0, max: 1, default: 1 }, // 0-1 confidence score
		fetchedAt: { type: Date, default: Date.now },
		url: String, // Source URL if applicable
	},
	{ _id: false }
);

/**
 * Metadata Field Schema
 * Individual metadata field with provenance tracking
 *
 * This schema wraps any metadata value with its source information and override status.
 * Used throughout the canonical metadata to track where each piece of data came from.
 *
 * @typedef {Object} MetadataField
 * @property {*} value - The actual metadata value (can be any type: string, number, date, etc.)
 * @property {Provenance} provenance - Source information for this metadata value
 * @property {boolean} [userOverride=false] - True if the user manually overrode the auto-fetched value
 */
const MetadataFieldSchema = new mongoose.Schema(
	{
		_id: false,
		value: mongoose.Schema.Types.Mixed, // The actual value
		provenance: ProvenanceSchema, // Where it came from
		userOverride: { type: Boolean, default: false }, // User manually set this
	},
	{ _id: false }
);

/**
 * Creator Schema
 * Represents a comic creator (writer, artist, etc.) with provenance tracking
 *
 * @typedef {Object} Creator
 * @property {string} name - Creator's name
 * @property {string} role - Creator's role (e.g., writer, artist, colorist, letterer, inker, cover artist)
 * @property {string} [id] - External ID from source (e.g., Metron creator ID)
 * @property {Provenance} provenance - Source information for this creator data
 */
const CreatorSchema = new mongoose.Schema(
	{
		_id: false,
		name: String,
		role: String, // writer, artist, colorist, letterer, etc.
		id: String, // External ID from source (e.g., Metron creator ID)
		provenance: ProvenanceSchema,
	},
	{ _id: false }
);

/**
 * Story Arc Schema
 * Represents a story arc that the comic is part of, with position tracking
 *
 * @typedef {Object} StoryArc
 * @property {string} name - Name of the story arc
 * @property {number} [number] - Issue's position/part number within the arc
 * @property {string} [id] - External ID from source
 * @property {Provenance} provenance - Source information for this story arc data
 */
const StoryArcSchema = new mongoose.Schema(
	{
		_id: false,
		name: String,
		number: Number, // Issue's position in the arc
		id: String, // External ID from source
		provenance: ProvenanceSchema,
	},
	{ _id: false }
);

/**
 * Universe Schema
 * Tracks multiverse/alternate reality designations (e.g., Marvel's Earth-616)
 *
 * @typedef {Object} Universe
 * @property {string} name - Name of the universe/reality
 * @property {string} [designation] - Official designation (e.g., "Earth-616", "Earth-1", "Prime Earth")
 * @property {string} [id] - External ID from source
 * @property {Provenance} provenance - Source information for this universe data
 */
const UniverseSchema = new mongoose.Schema(
	{
		_id: false,
		name: String,
		designation: String, // e.g., "Earth-616", "Earth-25"
		id: String, // External ID from source
		provenance: ProvenanceSchema,
	},
	{ _id: false }
);

/**
 * Price Schema
 * Stores pricing information with country and currency support
 *
 * @typedef {Object} Price
 * @property {string} country - ISO 3166-1 country code (e.g., "US", "GB", "CA")
 * @property {number} amount - Price amount
 * @property {string} currency - ISO 4217 currency code (e.g., "USD", "GBP", "EUR")
 * @property {Provenance} provenance - Source information for this price data
 */
const PriceSchema = new mongoose.Schema(
	{
		_id: false,
		country: String, // ISO country code (e.g., "US", "GB")
		amount: Number,
		currency: String, // ISO currency code (e.g., "USD", "GBP")
		provenance: ProvenanceSchema,
	},
	{ _id: false }
);

/**
 * External ID Schema
 * Links to external databases and services (ComicVine, Metron, GCD, MangaDex, etc.)
 *
 * @typedef {Object} ExternalID
 * @property {string} source - Name of the external source (e.g., "Metron", "Comic Vine", "Grand Comics Database", "MangaDex")
 * @property {string} id - The ID in the external system
 * @property {boolean} [primary=false] - Whether this is the primary/preferred external ID
 * @property {Provenance} provenance - Source information for this external ID
 */
const ExternalIDSchema = new mongoose.Schema(
	{
		_id: false,
		source: String, // e.g., "Metron", "Comic Vine", "Grand Comics Database", "MangaDex"
		id: String,
		primary: { type: Boolean, default: false },
		provenance: ProvenanceSchema,
	},
	{ _id: false }
);

/**
 * GTIN Schema
 * Global Trade Item Numbers including ISBN and UPC
 *
 * @typedef {Object} GTIN
 * @property {string} [isbn] - International Standard Book Number
 * @property {string} [upc] - Universal Product Code (barcode number)
 * @property {Provenance} provenance - Source information for this GTIN data
 */
const GTINSchema = new mongoose.Schema(
	{
		_id: false,
		isbn: String,
		upc: String,
		provenance: ProvenanceSchema,
	},
	{ _id: false }
);

/**
 * Reprint Schema
 * Information about reprinted content or where this issue has been reprinted
 *
 * @typedef {Object} Reprint
 * @property {string} description - Description of the reprint (e.g., "Reprinted in Amazing Spider-Man #100 (2002)")
 * @property {string} [id] - External ID from source for the reprint
 * @property {Provenance} provenance - Source information for this reprint data
 */
const ReprintSchema = new mongoose.Schema(
	{
		_id: false,
		description: String, // e.g., "Foo Bar #001 (2002)"
		id: String, // External ID from source
		provenance: ProvenanceSchema,
	},
	{ _id: false }
);

/**
 * URL Schema
 * External URLs with primary flag for prioritization
 *
 * @typedef {Object} URL
 * @property {string} url - The URL
 * @property {boolean} [primary=false] - Whether this is the primary/preferred URL
 * @property {Provenance} provenance - Source information for this URL
 */
const URLSchema = new mongoose.Schema(
	{
		_id: false,
		url: String,
		primary: { type: Boolean, default: false },
		provenance: ProvenanceSchema,
	},
	{ _id: false }
);

/**
 * Canonical Metadata Schema
 * The single source of truth for comic metadata, resolved from multiple external sources
 *
 * This schema represents the normalized, deduplicated metadata for a comic book issue.
 * Each field includes provenance tracking to maintain transparency about data sources.
 *
 * The canonical metadata is populated by merging data from multiple sources:
 * - ComicVine API
 * - Metron Comics Database
 * - Grand Comics Database (GCD)
 * - League of Comic Geeks (LOCG)
 * - ComicInfo.xml embedded in comic archives
 * - Manual user entries
 *
 * @typedef {Object} CanonicalMetadata
 * @property {MetadataField} title - Comic book title
 * @property {MetadataField} series - Series name
 * @property {MetadataField} volume - Volume number
 * @property {MetadataField} issueNumber - Issue number within the series
 * @property {ExternalID[]} externalIDs - Array of external database IDs
 * @property {MetadataField} publisher - Publisher name (e.g., Marvel, DC, Image)
 * @property {MetadataField} imprint - Publisher imprint (e.g., Vertigo for DC Comics)
 * @property {MetadataField} publicationDate - Actual store/release date
 * @property {MetadataField} coverDate - Cover date (often different from actual release)
 * @property {Object} seriesInfo - Detailed series information
 * @property {MetadataField} description - Summary/synopsis of the issue
 * @property {MetadataField} notes - Additional notes about the issue
 * @property {MetadataField[]} stories - Story titles within the issue
 * @property {StoryArc[]} storyArcs - Story arcs this issue is part of
 * @property {MetadataField[]} characters - Characters appearing in this issue
 * @property {MetadataField[]} teams - Teams appearing in this issue
 * @property {MetadataField[]} locations - Locations featured in this issue
 * @property {Universe[]} universes - Multiverse/alternate reality designations
 * @property {Creator[]} creators - Comic creators (writers, artists, etc.)
 * @property {MetadataField[]} genres - Genre classifications
 * @property {MetadataField[]} tags - User or system tags
 * @property {MetadataField} ageRating - Age rating (e.g., "Everyone", "Teen", "Mature")
 * @property {MetadataField} pageCount - Number of pages
 * @property {MetadataField} format - Format type (Single Issue, TPB, HC, etc.)
 * @property {Price[]} prices - Prices in different countries/currencies
 * @property {GTIN} gtin - Global Trade Item Numbers (ISBN, UPC)
 * @property {Reprint[]} reprints - Reprint information
 * @property {URL[]} urls - External URLs to metadata sources
 * @property {MetadataField} communityRating - Community rating/score
 * @property {MetadataField} coverImage - Cover image URL or path
 * @property {MetadataField} lastModified - Last modification timestamp
 */
const CanonicalMetadataSchema = new mongoose.Schema(
	{
		_id: false,
		// Core identifiers
		title: MetadataFieldSchema,
		series: MetadataFieldSchema,
		volume: MetadataFieldSchema,
		issueNumber: MetadataFieldSchema,

		// External IDs from various sources (Metron, ComicVine, GCD, MangaDex, etc.)
		externalIDs: [ExternalIDSchema],

		// Publication info
		publisher: MetadataFieldSchema,
		imprint: MetadataFieldSchema, // Publisher imprint (e.g., Vertigo for DC Comics)
		publicationDate: MetadataFieldSchema, // Store/release date
		coverDate: MetadataFieldSchema, // Cover date (often different from store date)

		// Series information
		seriesInfo: {
			type: {
				_id: false,
				id: String, // External series ID
				language: String, // ISO language code (e.g., "en", "de")
				sortName: String, // Alternative sort name
				startYear: Number,
				issueCount: Number, // Total issues in series
				volumeCount: Number, // Total volumes/collections
				alternativeNames: [MetadataFieldSchema], // Alternative series names
				provenance: ProvenanceSchema,
			},
			default: null,
		},

		// Content
		description: MetadataFieldSchema, // Summary/synopsis
		notes: MetadataFieldSchema, // Additional notes about the issue
		stories: [MetadataFieldSchema], // Story titles within the issue
		storyArcs: [StoryArcSchema], // Story arcs with position tracking
		characters: [MetadataFieldSchema],
		teams: [MetadataFieldSchema],
		locations: [MetadataFieldSchema],
		universes: [UniverseSchema], // Multiverse/alternate reality information

		// Creators
		creators: [CreatorSchema],

		// Classification
		genres: [MetadataFieldSchema],
		tags: [MetadataFieldSchema],
		ageRating: MetadataFieldSchema,

		// Physical/Digital properties
		pageCount: MetadataFieldSchema,
		format: MetadataFieldSchema, // Single Issue, TPB, HC, etc.

		// Commercial information
		prices: [PriceSchema], // Prices in different countries/currencies
		gtin: GTINSchema, // ISBN, UPC, etc.

		// Reprints
		reprints: [ReprintSchema], // Information about reprinted content

		// URLs
		urls: [URLSchema], // External URLs (ComicVine, Metron, etc.)

		// Ratings and popularity
		communityRating: MetadataFieldSchema,

		// Cover image
		coverImage: MetadataFieldSchema,

		// Metadata tracking
		lastModified: MetadataFieldSchema, // Last modification timestamp from source
	},
	{ _id: false }
);

/**
 * Raw File Details Schema
 * Physical file information for the comic archive
 *
 * Contains metadata about the actual comic file on disk, including path, size,
 * archive format, and cover image information.
 *
 * @typedef {Object} RawFileDetails
 * @property {string} name - Original file name
 * @property {string} filePath - Absolute or relative path to the comic file
 * @property {number} fileSize - File size in bytes
 * @property {string} extension - File extension (e.g., .cbz, .cbr, .pdf)
 * @property {string} mimeType - MIME type of the file
 * @property {string} containedIn - Parent directory or container path
 * @property {number} pageCount - Number of pages/images in the comic
 * @property {Object} archive - Archive extraction information
 * @property {boolean} archive.uncompressed - Whether the archive has been extracted
 * @property {string} archive.expandedPath - Path to extracted files
 * @property {Object} cover - Cover image information
 * @property {string} cover.filePath - Path to extracted cover image
 * @property {Object} cover.stats - File statistics for the cover image
 */
const RawFileDetailsSchema = mongoose.Schema({
	_id: false,
	name: String,
	filePath: String,
	fileSize: Number,
	extension: String,
	mimeType: String,
	containedIn: String,
	pageCount: Number,
	archive: {
		uncompressed: Boolean,
		expandedPath: String,
	},
	cover: {
		filePath: String,
		stats: Object,
	},
});

/**
 * LOCG (League of Comic Geeks) Schema
 * Legacy schema for League of Comic Geeks metadata
 *
 * Stores metadata fetched from the League of Comic Geeks API.
 * This is a legacy schema maintained for backward compatibility.
 *
 * @typedef {Object} LOCGData
 * @property {string} name - Comic name from LOCG
 * @property {string} publisher - Publisher name
 * @property {string} url - URL to the LOCG page
 * @property {string} cover - Cover image URL
 * @property {string} description - Comic description
 * @property {string} price - Price as a string
 * @property {number} rating - Community rating score
 * @property {number} pulls - Number of users who added to pull list
 * @property {number} potw - Pick of the Week count
 */
const LOCGSchema = mongoose.Schema({
	_id: false,
	name: String,
	publisher: String,
	url: String,
	cover: String,
	description: String,
	price: String,
	rating: Number,
	pulls: Number,
	potw: Number,
});

/**
 * Direct Connect Bundle Schema
 * Tracks files downloaded via DirectConnect protocol
 *
 * @typedef {Object} DirectConnectBundle
 * @property {number} bundleId - Unique identifier for the bundle
 * @property {string} name - Bundle/file name
 * @property {string} size - Size of the bundle (human-readable format)
 * @property {Object} type - Bundle type information
 */
const DirectConnectBundleSchema = mongoose.Schema({
	bundleId: Number,
	name: String,
	size: String,
	type: {},
	_id: false,
});

/**
 * Wanted Schema
 * Tracks comics marked as wanted by the user
 *
 * Used for managing the user's wanted list, which can be populated from external
 * sources like ComicVine or manually created. Supports marking entire volumes
 * or individual issues as wanted.
 *
 * @typedef {Object} WantedComic
 * @property {string} source - Source of the wanted data (e.g., "comicvine", "manual")
 * @property {boolean} markEntireVolumeWanted - Whether the entire volume is wanted or just specific issues
 * @property {Array<Object>} issues - Array of wanted issues
 * @property {number} issues[].id - Issue ID from external source
 * @property {string} issues[].url - URL to issue page
 * @property {Array} issues[].image - Cover images
 * @property {string} issues[].coverDate - Cover date of the issue
 * @property {string} issues[].issueNumber - Issue number
 * @property {Object} volume - Volume information
 * @property {number} volume.id - Volume ID from external source
 * @property {string} volume.url - URL to volume page
 * @property {Array} volume.image - Volume cover images
 * @property {string} volume.name - Volume name
 */
const wantedSchema = mongoose.Schema(
	{
		source: { type: String, default: null },
		markEntireVolumeWanted: Boolean,
		issues: {
			type: [
				{
					_id: false,
					id: Number,
					url: String,
					image: { type: Array, default: [] },
					coverDate: String,
					issueNumber: String,
				},
			],
			default: null,
		},
		volume: {
			type: {
				_id: false,
				id: Number,
				url: String,
				image: { type: Array, default: [] },
				name: String,
			},
			default: null,
		},
	},
	{ _id: false }
);

/**
 * Comic Schema
 * Main Mongoose schema for the Comic collection
 *
 * This is the primary data model for comic book metadata in the system. It combines:
 * - Import status tracking (whether the comic has been imported, tagged, etc.)
 * - Canonical metadata with provenance tracking (the authoritative metadata)
 * - Legacy sourced metadata (preserved for backward compatibility)
 * - File details (physical comic file information)
 * - Inferred metadata (extracted from file names and paths)
 * - Wanted list information (user's wishlist)
 * - Acquisition tracking (torrents, Usenet, DirectConnect downloads)
 *
 * The schema uses Elasticsearch integration for fast full-text searching and
 * includes timestamps for creation and update tracking.
 *
 * @typedef {Object} Comic
 * @property {Object} importStatus - Status flags for the comic import process
 * @property {boolean} importStatus.isImported - Whether the comic has been successfully imported
 * @property {boolean} importStatus.tagged - Whether metadata tagging is complete
 * @property {boolean} importStatus.isRawFileMissing - Whether the source file is missing
 * @property {Object} importStatus.matchedResult - Metadata matching results
 * @property {string} importStatus.matchedResult.score - Match quality score
 * @property {Object} userAddedMetadata - User-provided metadata
 * @property {string[]} userAddedMetadata.tags - User-defined tags
 * @property {CanonicalMetadata} canonicalMetadata - Canonical metadata with provenance (Elasticsearch indexed)
 * @property {Object} sourcedMetadata - Legacy metadata from various sources
 * @property {Object} sourcedMetadata.comicInfo - Metadata from ComicInfo.xml
 * @property {Object} sourcedMetadata.comicvine - Metadata from Comic Vine API
 * @property {Object} sourcedMetadata.metron - Metadata from Metron Comics Database
 * @property {Object} sourcedMetadata.gcd - Metadata from Grand Comics Database
 * @property {LOCGData} sourcedMetadata.locg - Metadata from League of Comic Geeks (Elasticsearch indexed)
 * @property {RawFileDetails} rawFileDetails - Physical file information (Elasticsearch indexed)
 * @property {Object} inferredMetadata - Metadata inferred from file name and path
 * @property {Object} inferredMetadata.issue - Issue-related inferred metadata
 * @property {string} inferredMetadata.issue.name - Inferred series/issue name (Elasticsearch indexed)
 * @property {number} inferredMetadata.issue.number - Inferred issue number (Elasticsearch indexed)
 * @property {string} inferredMetadata.issue.year - Inferred publication year
 * @property {string} inferredMetadata.issue.subtitle - Inferred subtitle (Elasticsearch indexed)
 * @property {WantedComic} wanted - Wanted list information
 * @property {Object} acquisition - Acquisition source tracking
 * @property {Object} acquisition.source - Source information
 * @property {boolean} acquisition.source.wanted - Whether this was acquired from wanted list
 * @property {string} acquisition.source.name - Name of the acquisition source
 * @property {Object} acquisition.release - Release information
 * @property {Object} acquisition.directconnect - DirectConnect download tracking
 * @property {DirectConnectBundle[]} acquisition.directconnect.downloads - Downloaded bundles (Elasticsearch indexed)
 * @property {Object[]} acquisition.torrent - Torrent download tracking
 * @property {string} acquisition.torrent[].infoHash - Torrent info hash
 * @property {string} acquisition.torrent[].name - Torrent name
 * @property {string[]} acquisition.torrent[].announce - Tracker announce URLs
 * @property {Object} acquisition.usenet - Usenet download tracking
 * @property {string} acquisition.usenet.sourceApplication - Application used for download (e.g., SABnzbd, NZBGet)
 * @property {Date} createdAt - Creation timestamp (added by timestamps option)
 * @property {Date} updatedAt - Last update timestamp (added by timestamps option)
 */
const ComicSchema = mongoose.Schema(
	{
		importStatus: {
			isImported: Boolean,
			tagged: Boolean,
			isRawFileMissing: { type: Boolean, default: false },
			matchedResult: {
				score: String,
			},
		},
		userAddedMetadata: {
			tags: [String],
		},

		// NEW: Canonical metadata with provenance
		canonicalMetadata: {
			type: CanonicalMetadataSchema,
			es_indexed: true,
			default: {},
		},

		// LEGACY: Keep existing sourced metadata for backward compatibility
		sourcedMetadata: {
			comicInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
			comicvine: { type: mongoose.Schema.Types.Mixed, default: {} },
			metron: { type: mongoose.Schema.Types.Mixed, default: {} },
			gcd: { type: mongoose.Schema.Types.Mixed, default: {} }, // Grand Comics Database
			locg: {
				type: LOCGSchema,
				es_indexed: true,
				default: {},
			},
		},

		rawFileDetails: {
			type: RawFileDetailsSchema,
			es_indexed: true,
			default: {},
		},
		inferredMetadata: {
			issue: {
				name: { type: String, es_indexed: true },
				number: {
					type: Number,
					es_indexed: true,
					required: false,
					default: 0,
				},
				year: String,
				subtitle: { type: String, es_indexed: true },
			},
		},
		wanted: wantedSchema,

		acquisition: {
			source: {
				wanted: { type: Boolean, default: false },
				name: { type: String, default: null },
			},
			release: {},
			directconnect: {
				downloads: {
					type: [DirectConnectBundleSchema],
					es_indexed: true,
					default: [],
				},
			},
			torrent: [
				{
					infoHash: String,
					name: String,
					announce: [String],
				},
			],
			usenet: {
				sourceApplication: String,
			},
		},
	},
	{ timestamps: true, minimize: false }
);

/**
 * Mongoosastic plugin for Elasticsearch integration
 * Enables automatic indexing of Comic documents to Elasticsearch
 * for fast full-text search capabilities
 */
ComicSchema.plugin(mongoosastic, {
	index: "comics",
	type: "comic",
	esClient: eSClient,
} as MongoosasticPluginOpts);

/**
 * Mongoose Paginate plugin
 * Adds pagination methods to query results (e.g., paginate(), paginateExec())
 */
ComicSchema.plugin(paginate);

/**
 * Database indexes for query performance optimization
 * These indexes improve query performance for common operations
 */
ComicSchema.index({ "rawFileDetails.filePath": 1 }); // For import statistics queries
ComicSchema.index({ "rawFileDetails.name": 1 }); // For duplicate detection
ComicSchema.index({ "wanted.volume.id": 1 }); // For wanted comics queries

/**
 * Comic Model
 * Mongoose model for the Comic collection with Elasticsearch support
 *
 * @type {mongoose.Model}
 * @exports Comic
 */
const Comic = mongoose.model("Comic", ComicSchema);
export default Comic;
