const OpenAI = require("openai")

const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1"
})

async function generateInterviewMaterial(prompt) {

    const response = await client.chat.completions.create({
        model: "openrouter/free",

        messages: [
            {
                role: "system",
                content: `
                You are an expert in providing interview material for any job. Generate maximum 5 interview questions.

                Return ONLY valid JSON.

                Do not return markdown.
                Do not add explanations.
                Do not wrap the JSON in triple backticks.

                Use this exact schema:
                {
                    "interviewQuestions": [],
                    "topicsToRevise": [],
                    "preparationTips": []
                }
                `
            },
            {
                role: "user",
                content: prompt
            }
        ]
    })

    return response.choices[0].message.content
}

async function generateHiringMaterial(prompt) {

    const response = await client.chat.completions.create({
        model: "openrouter/free",

        messages: [
            {
                role: "system",
                content: `
                You are an expert hiring assistant for recruiters. Help screen candidates and plan hiring.

                Return ONLY valid JSON.

                Do not return markdown.
                Do not add explanations.
                Do not wrap the JSON in triple backticks.

                Use this exact schema:
                {
                    "screeningQuestions": [],
                    "whatToLookFor": [],
                    "hiringTips": []
                }
                `
            },
            {
                role: "user",
                content: prompt
            }
        ]
    })

    return response.choices[0].message.content
}

module.exports = {
    generateInterviewMaterial,
    generateHiringMaterial
}