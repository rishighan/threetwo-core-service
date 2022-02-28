const mongoose = require("mongoose");
var mexp = require("mongoose-elasticsearch-xp").v7;
const paginate = require("mongoose-paginate-v2");

const { Client } = require("@elastic/elasticsearch");

export const eSClient = new Client({
	node: "http://localhost:9200",
	auth: {
		username: "elastic",
		password: "password",
	},
});

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
			tags: [],
		},
		sourcedMetadata: {
			comicInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
			comicvine: { type: mongoose.Schema.Types.Mixed, default: {} },
			shortboxed: {},
			gcd: {},
		},
		rawFileDetails: {
			name: { type: String, es_indexed: true },
			filePath: String,
			fileSize: Number,
			extension: String,
			containedIn: String,
			pageCount: Number,
			cover: {
				filePath: String,
				stats: Object,
			},
			calibreMetadata: {
				coverWriteResult: String,
			},
		},
		inferredMetadata: {
			issue: {
				name: String,
				number: {
					type: Number,
					es_indexed: true,
					required: false,
					default: 0,
				},
				year: String,
				subtitle: String,
			},
		},
		acquisition: {
			wanted: Boolean,
			release: {},
			directconnect: Array,
			torrent: {
				sourceApplication: String,
				magnet: String,
				tracker: String,
				status: String,
			},
			usenet: {
				sourceApplication: String,
			},
		},
	},
	{ timestamps: true, minimize: false }
);

ComicSchema.plugin(mexp, {
	client: eSClient,
});
ComicSchema.plugin(paginate);
const Comic = mongoose.model("Comic", ComicSchema);
export default Comic;
