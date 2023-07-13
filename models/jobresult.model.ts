const mongoose = require("mongoose");
const paginate = require("mongoose-paginate-v2");

const JobResultScehma = mongoose.Schema({
	id: Number,
	status: String,
	failedReason: Object
});

const JobResult = mongoose.model("JobResult", JobResultScehma);
export default JobResult;
