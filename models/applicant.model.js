const mongoose = require('mongoose')

const applicantSchema = new mongoose.Schema({
    user:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true
    },
    profilePhoto: {
        type: String
    },
    resume: {
        type: String
    },
    skills: {
        type:[String]
    },
    education: {
        type: String,
        enum: ["Undergraduate", "Postgraduate"]
    }
},{
    timestamps: true
})

const Applicant = mongoose.model("Applicant", applicantSchema)
module.exports = Applicant