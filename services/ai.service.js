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

async function generateApplicantInsights(question, applicants) {
    const response = await client.chat.completions.create({
        model: "openrouter/free",

        messages: [
            {
                role: "system",
                content: `
                You are an expert hiring assistant. Answer ONLY using the applicant data provided.
                Do not invent applicants. If data is missing, say so.

                Return ONLY valid JSON.
                Do not return markdown.
                Do not add explanations.
                Do not wrap the JSON in triple backticks.

                Use this exact schema:
                {
                    "answer": "",
                    "topCandidates": []
                }

                topCandidates should be an array of strings like "Name - reason".
                If the question does not need a ranking, return an empty topCandidates array.
                `
            },
            {
                role: "user",
                content: `Applicants:\n${JSON.stringify(applicants, null, 2)}\n\nQuestion: ${question}`
            }
        ]
    })

    return response.choices[0].message.content
}

module.exports = {
    generateInterviewMaterial,
    generateHiringMaterial,
    generateApplicantInsights
}