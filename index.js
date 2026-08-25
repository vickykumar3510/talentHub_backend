const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
require('dotenv').config()

const aiRoutes = require('./routes/ai.routes')
const cors = require('cors')
const PostJob = require('./models/postJob.model')
const User = require('./models/user.model')
const Applicant = require('./models/applicant.model')
const Application = require('./models/application.model')
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

        const newJob = await postJob({
            ...req.body,
            postedBy: req.user.id,
            status: "Active"
        })
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
        const job = await PostJob.find({ status: { $ne: "Archived" } })
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

        const job = await PostJob.findById(req.params.id)
        if(!job){
            return res.status(404).json({message: "Job not found."})
        }
        if(job.postedBy && String(job.postedBy) !== req.user.id){
            return res.status(403).json({message: "You can only update your own jobs."})
        }

        const dataToUpdate = { ...req.body }
        delete dataToUpdate.postedBy
        delete dataToUpdate.status

        const updatedJob = await updateJob(req.params.id, dataToUpdate)
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
        return {
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role
            }
        }

    }catch(error){
        throw error
    }
}

app.post('/login', async(req, res) => {
    try{
        const {email, password} = req.body
        const result = await loginUser(email, password)
        return res.status(200).json({message: "Login successfully", token: result.token, user: result.user})

    }catch(error){
        return res.status(500).json({message: "Error while login", error: error.message})
    }

})

//get all users

async function getUsers(){
    try{
        const users = await User.find().select('-password')
        return users
    }catch(error){
        throw error
    }
}

app.get('/users', async(req, res) => {
    try{
        const findUsers = await getUsers()
        if(findUsers.length !== 0){
            return res.status(200).json(findUsers)
        } else {
            return res.status(404).json({message: "No users found."})
        }
    }catch(error){
        return res.status(500).json({message: "Failed to fetch users", error: error.message})
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

//recruiter jobs

app.get('/recruiter/jobs', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Recruiter"){
            return res.status(403).json({message: "Only recruiter can view posted jobs."})
        }

        const jobs = await PostJob.find({ postedBy: req.user.id })
        return res.status(200).json(jobs)
    }catch(error){
        return res.status(500).json({message: "Failed to fetch recruiter jobs", error: error.message})
    }
})

//archive job - only recruiter

app.put('/jobs/:id/archive', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Recruiter"){
            return res.status(403).json({message: "Only recruiter can archive jobs."})
        }

        const job = await PostJob.findById(req.params.id)
        if(!job){
            return res.status(404).json({message: "Job not found."})
        }
        if(job.postedBy && String(job.postedBy) !== req.user.id){
            return res.status(403).json({message: "You can only archive your own jobs."})
        }

        job.status = "Archived"
        await job.save()
        return res.status(200).json({message: "Job archived", job})
    }catch(error){
        return res.status(500).json({message: "Failed to archive job", error: error.message})
    }
})

//apply job - only applicant

app.post('/jobs/:id/apply', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Applicant"){
            return res.status(403).json({message: "Recruiters cannot apply for jobs."})
        }

        const job = await PostJob.findById(req.params.id)
        if(!job || job.status === "Archived"){
            return res.status(404).json({message: "Job not found."})
        }

        const existing = await Application.findOne({ job: req.params.id, applicant: req.user.id })
        if(existing && existing.status !== "Withdrawn"){
            return res.status(400).json({message: "Already applied for this job."})
        }

        if(existing && existing.status === "Withdrawn"){
            existing.status = "Applied"
            await existing.save()
            return res.status(200).json({message: "Application submitted", application: existing})
        }

        const application = new Application({
            job: req.params.id,
            applicant: req.user.id,
            status: "Applied"
        })
        await application.save()
        return res.status(201).json({message: "Application submitted", application})
    }catch(error){
        return res.status(500).json({message: "Failed to apply", error: error.message})
    }
})

//my applications - only applicant

app.get('/applications/mine', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Applicant"){
            return res.status(403).json({message: "Only applicants can view applications."})
        }

        const applications = await Application.find({ applicant: req.user.id }).populate('job')
        return res.status(200).json(applications)
    }catch(error){
        return res.status(500).json({message: "Failed to fetch applications", error: error.message})
    }
})

//withdraw application - only applicant

app.put('/applications/:id/withdraw', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Applicant"){
            return res.status(403).json({message: "Only applicants can withdraw applications."})
        }

        const application = await Application.findById(req.params.id)
        if(!application){
            return res.status(404).json({message: "Application not found."})
        }
        if(String(application.applicant) !== req.user.id){
            return res.status(403).json({message: "You can only withdraw your own application."})
        }

        application.status = "Withdrawn"
        await application.save()
        return res.status(200).json({message: "Application withdrawn", application})
    }catch(error){
        return res.status(500).json({message: "Failed to withdraw application", error: error.message})
    }
})

//view applicants - only recruiter

app.get('/jobs/:id/applicants', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Recruiter"){
            return res.status(403).json({message: "Only recruiter can view applicants."})
        }

        const job = await PostJob.findById(req.params.id)
        if(!job){
            return res.status(404).json({message: "Job not found."})
        }
        if(job.postedBy && String(job.postedBy) !== req.user.id){
            return res.status(403).json({message: "You can only view applicants for your own jobs."})
        }

        const applicants = await Application.find({
            job: req.params.id,
            status: { $ne: "Withdrawn" }
        }).populate('applicant', 'fullName email')

        return res.status(200).json(applicants)
    }catch(error){
        return res.status(500).json({message: "Failed to fetch applicants", error: error.message})
    }
})

app.get('/jobs/:id', async(req, res) => {
    try{
        const job = await PostJob.findById(req.params.id)
        if(job){
            return res.status(200).json(job)
        } else {
            return res.status(404).json({message: "Job not found."})
        }
    }catch(error){
        return res.status(500).json({message: "Failed to fetch job", error: error.message})
    }
})

//shortlist or reject - only recruiter

app.put('/applications/:id/status', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Recruiter"){
            return res.status(403).json({message: "Only recruiter can update applicant status."})
        }

        const { status } = req.body
        if(status !== "Shortlisted" && status !== "Rejected"){
            return res.status(400).json({message: "Status must be Shortlisted or Rejected."})
        }

        const application = await Application.findById(req.params.id)
        if(!application){
            return res.status(404).json({message: "Application not found."})
        }

        const job = await PostJob.findById(application.job)
        if(job.postedBy && String(job.postedBy) !== req.user.id){
            return res.status(403).json({message: "You can only update applicants for your own jobs."})
        }

        application.status = status
        await application.save()
        return res.status(200).json({message: "Applicant status updated", application})
    }catch(error){
        return res.status(500).json({message: "Failed to update applicant status", error: error.message})
    }
})

//ai

app.use("/api/ai", verifyJWT, aiRoutes)

//404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`Server is running on the PORT ${PORT}`)
})
