const express = require("express");

const router = express.Router();

const {generateInterviewMaterial, generateHiringMaterial} = require('../services/ai.service')

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

    const { prompt } = req.body;

    const answer = await generateHiringMaterial(prompt);

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
