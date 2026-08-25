const mongoose = require('mongoose')

const applicationSchema = new mongoose.Schema({
    job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JobPost",
        required: true
    },
    applicant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    status: {
        type: String,
        enum: ["Applied", "Shortlisted", "Rejected", "Withdrawn"],
        default: "Applied"
    }
},{
    timestamps: true
})

const Application = mongoose.model("Application", applicationSchema)
module.exports = Application
