const mongoose = require("mongoose");

const JobResultScehma = mongoose.Schema({
	id: Number,
	status: String,
	failedReason: Object,
	timestamp: Date,
});

const JobResult = mongoose.model("JobResult", JobResultScehma);
export default JobResult;
