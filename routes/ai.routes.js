const express = require("express");

const router = express.Router();

const {generateInterviewMaterial} = require('../services/ai.service')

router.post("/talenthub-interview", async (req, res) => {
  try {
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

module.exports = router;