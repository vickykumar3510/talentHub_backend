const express = require("express");

const router = express.Router();

const PostJob = require("../models/postJob.model")
const Application = require("../models/application.model")
const Applicant = require("../models/applicant.model")
const {generateInterviewMaterial, generateApplicantInsights} = require('../services/ai.service')

router.post("/talenthub-interview", async (req, res) => {
  try {
    if(req.user.role !== "Applicant"){
      return res.status(403).json({message: "Only applicants can use interview assistant."})
    }

    const { prompt } = req.body;

    const answer = await generateInterviewMaterial(prompt);

    res.json({
      success: true,
      answer,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.post("/talenthub-hiring", async (req, res) => {
  try {
    if(req.user.role !== "Recruiter"){
      return res.status(403).json({message: "Only recruiters can use hiring assistant."})
    }

    const { prompt, question } = req.body;
    const recruiterQuestion = (question || prompt || "").trim();

    if (!recruiterQuestion) {
      return res.status(400).json({ message: "Please enter a question." })
    }

    const jobs = await PostJob.find({ postedBy: req.user.id }).select("_id jobTitle requiredSkills")
    const jobIds = jobs.map((job) => job._id)

    const applications = await Application.find({
      job: { $in: jobIds },
      status: { $ne: "Withdrawn" }
    })
      .populate("applicant", "fullName email")
      .populate("job", "jobTitle requiredSkills")
      .limit(30)

    if (applications.length === 0) {
      return res.json({
        success: true,
        answer: JSON.stringify({
          answer: "You have no applicants yet. Once people apply to your jobs, I can rank and summarize them.",
          topCandidates: []
        })
      })
    }

    const userIds = applications
      .map((item) => item.applicant?._id)
      .filter(Boolean)

    const profiles = await Applicant.find({ user: { $in: userIds } }).select("user skills education bio experience")
    const profileByUser = {}
    profiles.forEach((profile) => {
      profileByUser[String(profile.user)] = profile
    })

    const applicants = applications.map((item) => {
      const profile = profileByUser[String(item.applicant?._id)]
      return {
        name: item.applicant?.fullName || "Unknown",
        email: item.applicant?.email || "",
        jobTitle: item.job?.jobTitle || "",
        jobRequiredSkills: item.job?.requiredSkills || [],
        status: item.status,
        skills: profile?.skills || [],
        education: profile?.education || "Not provided",
        bio: profile?.bio || "",
        experience: profile?.experience || ""
      }
    })

    const answer = await generateApplicantInsights(recruiterQuestion, applicants);

    res.json({
      success: true,
      answer,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
