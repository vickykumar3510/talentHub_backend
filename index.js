const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
require('dotenv').config()

const cors = require('cors')
const PostJob = require('./models/postJob.model')
const User = require('./models/user.model')
const Applicant = require('./models/applicant.model')
const {connectDB} = require('./db/db.connect')


const app = express()
connectDB()

app.use(express.json())
app.use(cors())

const JWT_SECRET = process.env.JWT_SECRET


//checking API

app.get('/', (req, res) => {
    res.send('API of Talent Hub is working')
})

//middleware

async function verifyJWT(req, res, next){
    const authHeader = req.headers['authorization']

    if(!authHeader){
        return res.status(401).json({message: "No token provided"})
    }

    const token = authHeader.split(' ')[1]

    if(!token){
        return res.status(401).json({message: "Malformed token"})
    }

    try{
        const decodedToken = jwt.verify(token, JWT_SECRET)
        req.user = decodedToken

        next()
    }catch(error){
        return res.status(401).json({message: "Invalid token"})
    }
    
}

//post job - only recuriter

async function postJob(data){
    try{
        const job = new PostJob(data)
        return await job.save()
    }catch(error){
        throw error
    }
}

app.post('/jobs', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Recruiter"){
            return res.status(403).json({message: "Only recruiter can post jobs."})
        }

        const newJob = await postJob(req.body)
        if(newJob){
            return res.status(201).json({message: "New Job added", job: newJob})
        } else {
            return res.status(400).json({message: "Invalid data"})
        }

    }catch(error){
        return res.status(500).json({message: "Failed to post job", error: error.message})
    }
})

//get job data

async function getJobs(){
    try{
        const job = await PostJob.find()
        return job

    }catch(error){
        throw error
    }
}

app.get('/jobs', async(req, res) => {
    try{
        const findJobs = await getJobs()
        if(findJobs.length !== 0){
            return res.status(200).json(findJobs)
        } else {
            return res.status(404).json({message: "No jobs found."})
        }
        
    }catch(error){
        return res.status(500).json({message: "Failed to fetch jobs data", error: error.message})
    }
})

//update a job - only recuriter

async function updateJob(id, dataToUpdate){
    try{
        const job = await PostJob.findByIdAndUpdate(id, dataToUpdate, {new: true, runValidators: true})
        return job

    }catch(error){
        throw error
    }
}

app.put('/jobs/:id', verifyJWT, async(req, res) => {
    try{

        if(req.user.role !== "Recruiter"){
            return res.status(403).json({message: "Only Recruiter can update job."})
        }

        const updatedJob = await updateJob(req.params.id, req.body)
        if(updatedJob){
            return res.status(200).json({message: "Job updated", job: updatedJob})
        } else {
            return res.status(400).json({message: "Error while updating the job."})
        }
        
    }catch(error){
        return res.status(500).json({message: "Failed to update job", error: error.message})
    }
})

//signup

async function userSignup(fullName, email, password, role){
    try{

        const existingUser = await User.findOne({email})

        if(existingUser){
            throw new Error("User already exists")
        }

        const hashedPassword = await bcrypt.hash(password, 10)
        
        const user = new User({
            fullName,
            email,
            password: hashedPassword,
            role
        })

        return await user.save()   
    }catch(error){
        throw error
    }
}

app.post('/signup', async(req, res) => {
    try{
        const {fullName, email, password, role} = req.body

        const user = await userSignup(fullName, email, password, role)

        return res.status(201).json({message: "User has been signup successfully", user})
        
    }catch(error){
        return res.status(500).json({message: "Error while signup", error: error.message})
    }
})

//login

async function loginUser(email, password){
    try{
        const user = await User.findOne({email})

        if(!user){
            throw new Error("Invalid credentials")
        }

        const isMatch = await bcrypt.compare(password, user.password)

        if(!isMatch){
            throw new Error("Invalid credentials")
        }

        const token = jwt.sign({id: user._id, role: user.role}, JWT_SECRET, {expiresIn: "24h"})
        return token

    }catch(error){
        throw error
    }
}

app.post('/login', async(req, res) => {
    try{
        const {email, password} = req.body
        const token = await loginUser(email, password)
        return res.status(200).json({message: "Login successfully", token})

    }catch(error){
        return res.status(500).json({message: "Error while login", error: error.message})
    }

})

//applicant profile - only applicant

async function getApplicantProfile(userId){
    try{
        const profile = await Applicant.findOne({user: userId}).populate('user', 'fullName email')
        return profile
    }catch(error){
        throw error
    }
}

app.get('/applicant/profile', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Applicant"){
            return res.status(403).json({message: "Only applicants can view profile."})
        }

        const profile = await getApplicantProfile(req.user.id)
        if(profile){
            return res.status(200).json(profile)
        } else {
            return res.status(404).json({message: "Profile not found."})
        }

    }catch(error){
        return res.status(500).json({message: "Failed to fetch profile", error: error.message})
    }
})

async function createApplicantProfile(userId, data){
    try{
        const profile = new Applicant({
            user: userId,
            ...data
        })
        return await profile.save()
    }catch(error){
        throw error
    }
}

app.post('/applicant/profile', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Applicant"){
            return res.status(403).json({message: "Only applicants can create profile."})
        }

        const existingProfile = await Applicant.findOne({user: req.user.id})
        if(existingProfile){
            return res.status(400).json({message: "Profile already exists. Use update instead."})
        }

        const {profilePhoto, resume, skills, education} = req.body
        const newProfile = await createApplicantProfile(req.user.id, {profilePhoto, resume, skills, education})

        return res.status(201).json({message: "Profile created successfully", profile: newProfile})

    }catch(error){
        return res.status(500).json({message: "Failed to create profile", error: error.message})
    }
})

async function updateApplicantProfile(userId, dataToUpdate){
    try{
        const profile = await Applicant.findOneAndUpdate(
            {user: userId},
            dataToUpdate,
            {new: true, runValidators: true}
        )
        return profile
    }catch(error){
        throw error
    }
}

app.put('/applicant/profile', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Applicant"){
            return res.status(403).json({message: "Only applicants can update profile."})
        }

        const {profilePhoto, resume, skills, education} = req.body
        const updatedProfile = await updateApplicantProfile(req.user.id, {profilePhoto, resume, skills, education})

        if(updatedProfile){
            return res.status(200).json({message: "Profile updated successfully", profile: updatedProfile})
        } else {
            return res.status(404).json({message: "Profile not found. Create profile first."})
        }

    }catch(error){
        return res.status(500).json({message: "Failed to update profile", error: error.message})
    }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`Server is running on the PORT ${PORT}`)
})
