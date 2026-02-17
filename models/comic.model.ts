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
					_id: false, // Disable automatic ObjectId creation for each issue
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
				_id: false, // Disable automatic ObjectId creation for volume
				id: Number,
				url: String,
				image: { type: Array, default: [] },
				name: String,
			},
			default: null,
		},
	},
	{ _id: false }
); // Disable automatic ObjectId creation for the wanted object itself

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
		sourcedMetadata: {
			comicInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
			comicvine: { type: mongoose.Schema.Types.Mixed, default: {} }, // Set as a freeform object
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
