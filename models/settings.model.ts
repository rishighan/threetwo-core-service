const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const HostSchema = mongoose.Schema({
	_id: false,
	username: String,
	password: String,
	hostname: String,
	port: String,
	protocol: String,
});
const SettingsScehma = mongoose.Schema({
	directConnect: {
		client: {
			host: HostSchema,
			airDCPPUserSettings: Object,
			hubs: Array,
		},
	},
	bittorrent: {
		client: {
			name: String,
			host: HostSchema,
		},
	},
});

const Settings = mongoose.model("Settings", SettingsScehma);
export default Settings;
