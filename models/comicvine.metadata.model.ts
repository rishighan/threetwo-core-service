const mongoose = require("mongoose");
const Things = mongoose.Schema({
	_id: false,
	api_detail_url: String,
	id: Number,
	name: String,
	site_detail_url: String,
	count: String,
});
const Issue = mongoose.Schema({
	_id: false,
	api_detail_url: String,
	id: Number,
	name: String,
	issue_number: String,
});
const VolumeInformation = mongoose.Schema({
	_id: false,
	aliases: [],
	api_detail_url: String,
	characters: [Things],
	concepts: [Things],
	count_of_issues: String,
	date_added: String,
	date_last_updated: String,
	deck: String,
	description: String,
	first_issue: Issue,
	id: Number,
	image: {
		icon_url: String,
		medium_url: String,
		screen_url: String,
		screen_large_url: String,
		small_url: String,
		super_url: String,
		thumb_url: String,
		tiny_url: String,
		original_url: String,
		image_tags: String,
	},
	issues: [
		{
			api_detail_url: String,
			id: Number,
			name: String,
			issue_number: String,
			site_detail_url: String,
		},
	],
	last_issue: Issue,
	locations: [Things],
	name: String,
	objects: [Things],
	people: [Things],
	publisher: {
		api_detail_url: String,
		id: Number,
		name: String,
	},
	site_detail_url: String,
	start_year: String,
});

const ComicVineMetadataSchema = mongoose.Schema({
	_id: false,
	aliases: [String],
	api_detail_url: String,
	cover_date: String,
	date_added: String,
	date_last_updated: String,
	deck: String,
	description: String,
	image: {
		icon_url: String,
		medium_url: String,
		screen_url: String,
		screen_large_url: String,
		small_url: String,
		super_url: String,
		thumb_url: String,
		tiny_url: String,
		original_url: String,
		image_tags: String,
	},

	has_staff_review: Boolean,
	id: Number,
	name: String,
	resource_type: String,
	volumeInformation: VolumeInformation,
});

export default ComicVineMetadataSchema;
