const paginate = require("mongoose-paginate-v2");
const { Client } = require("@elastic/elasticsearch");
import { mongoosastic } from "mongoosastic-ts";
const mongoose = require("mongoose");
import {
	MongoosasticDocument,
	MongoosasticModel,
	MongoosasticPluginOpts,
} from "mongoosastic-ts/dist/types";
const ELASTICSEARCH_HOST =
	process.env.ELASTICSEARCH_URI || "http://localhost:9200";
console.log(`ELASTICSEARCH -> ${ELASTICSEARCH_HOST}`);
export const eSClient = new Client({
	node: ELASTICSEARCH_HOST,
	auth: {
		username: "elastic",
		password: "password",
	},
});

// Metadata source enumeration
export enum MetadataSource {
	COMICVINE = "comicvine",
	METRON = "metron",
	GRAND_COMICS_DATABASE = "gcd",
	LOCG = "locg",
	COMICINFO_XML = "comicinfo",
	MANUAL = "manual",
}

// Provenance schema - tracks where each piece of metadata came from
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

// Individual metadata field with provenance
const MetadataFieldSchema = new mongoose.Schema(
	{
		_id: false,
		value: mongoose.Schema.Types.Mixed, // The actual value
		provenance: ProvenanceSchema, // Where it came from
		userOverride: { type: Boolean, default: false }, // User manually set this
	},
	{ _id: false }
);

// Creator with provenance
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

// Story Arc with provenance
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

// Universe schema for multiverse/alternate reality tracking
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

// Price information with country codes
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

// External IDs from various sources
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

// GTIN (Global Trade Item Number) - includes ISBN, UPC, etc.
const GTINSchema = new mongoose.Schema(
	{
		_id: false,
		isbn: String,
		upc: String,
		provenance: ProvenanceSchema,
	},
	{ _id: false }
);

// Reprint information
const ReprintSchema = new mongoose.Schema(
	{
		_id: false,
		description: String, // e.g., "Foo Bar #001 (2002)"
		id: String, // External ID from source
		provenance: ProvenanceSchema,
	},
	{ _id: false }
);

// URL with primary flag
const URLSchema = new mongoose.Schema(
	{
		_id: false,
		url: String,
		primary: { type: Boolean, default: false },
		provenance: ProvenanceSchema,
	},
	{ _id: false }
);

// Canonical metadata - resolved from multiple sources
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

const DirectConnectBundleSchema = mongoose.Schema({
	bundleId: Number,
	name: String,
	size: String,
	type: {},
	_id: false,
});

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

const ComicSchema = mongoose.Schema(
	{
		importStatus: {
			isImported: Boolean,
			tagged: Boolean,
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

ComicSchema.plugin(mongoosastic, {
	index: "comics",
	type: "comic",
	esClient: eSClient,
} as MongoosasticPluginOpts);
ComicSchema.plugin(paginate);

const Comic = mongoose.model("Comic", ComicSchema);
export default Comic;
