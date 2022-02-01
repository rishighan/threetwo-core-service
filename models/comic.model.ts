const mongoose = require("mongoose");
var mexp = require('mongoose-elasticsearch-xp').v7;
const paginate = require("mongoose-paginate-v2");

const { Client } = require("@elastic/elasticsearch");

const eSClient = new Client({
	node: "http://tower.local:9200",
	auth: {
		username: "elastic",
		password: "password",
	},
});


const ComicSchema = mongoose.Schema({
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
		comicInfo: {
			blackAndWhite: String,
			characters: [String],
			count: String,
			genre: String,
			manga: String,
			month: String,
			number: String,
			pageCount: String,
			pages: [],
			publisher: String,
			summary: String,
			title: String,
			writer: String,
			year: String,
		},
		comicvine: {},
		shortboxed: {},
		gcd: {},
	},
	rawFileDetails: {
		name: { type: String, es_indexed: true },
		path: String,
		fileSize: Number,
		extension: String,
		containedIn: String,
		pageCount: Number,
		cover: {
			filePath: String,
			stats: Object,
		},
		calibreMetadata :{
			coverWriteResult: String,
		}
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
}, { timestamps: true});
ComicSchema.plugin(mexp, {
	client: eSClient,
});
ComicSchema.plugin(paginate);
const Comic = mongoose.model("Comic", ComicSchema);
export default Comic;
