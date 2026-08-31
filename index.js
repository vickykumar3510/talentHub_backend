const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const multer = require('multer')
require('dotenv').config()

const aiRoutes = require('./routes/ai.routes')
const cors = require('cors')
const PostJob = require('./models/postJob.model')
const User = require('./models/user.model')
const Applicant = require('./models/applicant.model')
const Recruiter = require('./models/recruiter.model')
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

const profileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'profilePhoto' && !file.mimetype.startsWith('image/')) {
            return cb(new Error('Profile photo must be an image'))
        }
        if (file.fieldname === 'resume' && file.mimetype !== 'application/pdf') {
            return cb(new Error('Resume must be a PDF'))
        }
        cb(null, true)
    }
}).fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'resume', maxCount: 1 }
])

function handleProfileUpload(req, res, next) {
    profileUpload(req, res, (err) => {
        if (err) {
            return res.status(400).json({ message: err.message })
        }
        next()
    })
}

function fileToDataUrl(file) {
    return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
}

function parseSkills(skills) {
    if (Array.isArray(skills)) {
        return skills
    }
    if (typeof skills !== 'string' || !skills.trim()) {
        return []
    }
    try {
        const parsed = JSON.parse(skills)
        if (Array.isArray(parsed)) {
            return parsed
        }
    } catch {
        // comma-separated list from FormData
    }
    return skills.split(',').map((skill) => skill.trim()).filter(Boolean)
}

function getProfilePayload(req) {
    const payload = {}
    if (req.body.skills !== undefined) {
        payload.skills = parseSkills(req.body.skills)
    }
    if (req.body.education !== undefined) {
        payload.education = req.body.education
    }
    const photoFile = req.files?.profilePhoto?.[0]
    const resumeFile = req.files?.resume?.[0]
    if (photoFile) {
        payload.profilePhoto = fileToDataUrl(photoFile)
    }
    if (resumeFile) {
        payload.resume = fileToDataUrl(resumeFile)
    }
    return payload
}

const recruiterUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'companyLogo' && !file.mimetype.startsWith('image/')) {
            return cb(new Error('Company logo must be an image'))
        }
        cb(null, true)
    }
}).fields([
    { name: 'companyLogo', maxCount: 1 }
])

function handleRecruiterUpload(req, res, next) {
    recruiterUpload(req, res, (err) => {
        if (err) {
            return res.status(400).json({ message: err.message })
        }
        next()
    })
}

function getRecruiterProfilePayload(req) {
    const payload = {}
    if (req.body.companyName !== undefined) {
        payload.companyName = req.body.companyName
    }
    if (req.body.website !== undefined) {
        payload.website = req.body.website
    }
    if (req.body.aboutCompany !== undefined) {
        payload.aboutCompany = req.body.aboutCompany
    }
    const logoFile = req.files?.companyLogo?.[0]
    if (logoFile) {
        payload.companyLogo = fileToDataUrl(logoFile)
    }
    return payload
}

//post job - only recuriter

function startOfToday() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
}

function isDeadlineInThePast(deadline) {
    if (!deadline) return true
    const date = new Date(deadline)
    if (Number.isNaN(date.getTime())) return true
    date.setHours(0, 0, 0, 0)
    return date < startOfToday()
}

function isApplicationClosed(deadline) {
    if (!deadline) return false
    const date = new Date(deadline)
    if (Number.isNaN(date.getTime())) return false
    date.setHours(23, 59, 59, 999)
    return new Date() > date
}

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

        if(isDeadlineInThePast(req.body.applicationDeadline)){
            return res.status(400).json({message: "Application deadline cannot be in the past."})
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
        return res.status(200).json(findJobs)
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

        if(isDeadlineInThePast(dataToUpdate.applicationDeadline)){
            return res.status(400).json({message: "Application deadline cannot be in the past."})
        }

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

app.post('/applicant/profile', verifyJWT, handleProfileUpload, async(req, res) => {
    try{
        if(req.user.role !== "Applicant"){
            return res.status(403).json({message: "Only applicants can create profile."})
        }

        const existingProfile = await Applicant.findOne({user: req.user.id})
        if(existingProfile){
            return res.status(400).json({message: "Profile already exists. Use update instead."})
        }

        const newProfile = await createApplicantProfile(req.user.id, getProfilePayload(req))

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

app.put('/applicant/profile', verifyJWT, handleProfileUpload, async(req, res) => {
    try{
        if(req.user.role !== "Applicant"){
            return res.status(403).json({message: "Only applicants can update profile."})
        }

        const updatedProfile = await updateApplicantProfile(req.user.id, getProfilePayload(req))

        if(updatedProfile){
            return res.status(200).json({message: "Profile updated successfully", profile: updatedProfile})
        } else {
            return res.status(404).json({message: "Profile not found. Create profile first."})
        }

    }catch(error){
        return res.status(500).json({message: "Failed to update profile", error: error.message})
    }
})

//recruiter profile - only recruiter

async function getRecruiterProfile(userId){
    try{
        const profile = await Recruiter.findOne({user: userId}).populate('user', 'fullName email')
        return profile
    }catch(error){
        throw error
    }
}

app.get('/recruiter/profile', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Recruiter"){
            return res.status(403).json({message: "Only recruiters can view profile."})
        }

        const profile = await getRecruiterProfile(req.user.id)
        if(profile){
            return res.status(200).json(profile)
        } else {
            return res.status(404).json({message: "Profile not found."})
        }

    }catch(error){
        return res.status(500).json({message: "Failed to fetch profile", error: error.message})
    }
})

async function createRecruiterProfile(userId, data){
    try{
        const profile = new Recruiter({
            user: userId,
            ...data
        })
        return await profile.save()
    }catch(error){
        throw error
    }
}

app.post('/recruiter/profile', verifyJWT, handleRecruiterUpload, async(req, res) => {
    try{
        if(req.user.role !== "Recruiter"){
            return res.status(403).json({message: "Only recruiters can create profile."})
        }

        const existingProfile = await Recruiter.findOne({user: req.user.id})
        if(existingProfile){
            return res.status(400).json({message: "Profile already exists. Use update instead."})
        }

        const newProfile = await createRecruiterProfile(req.user.id, getRecruiterProfilePayload(req))

        return res.status(201).json({message: "Profile created successfully", profile: newProfile})

    }catch(error){
        return res.status(500).json({message: "Failed to create profile", error: error.message})
    }
})

async function updateRecruiterProfile(userId, dataToUpdate){
    try{
        const profile = await Recruiter.findOneAndUpdate(
            {user: userId},
            { user: userId, ...dataToUpdate },
            {new: true, runValidators: true, upsert: true, setDefaultsOnInsert: true}
        )
        return await Recruiter.findById(profile._id).populate('user', 'fullName email')
    }catch(error){
        throw error
    }
}

app.put('/recruiter/profile', verifyJWT, handleRecruiterUpload, async(req, res) => {
    try{
        if(req.user.role !== "Recruiter"){
            return res.status(403).json({message: "Only recruiters can update profile."})
        }

        const updatedProfile = await updateRecruiterProfile(req.user.id, getRecruiterProfilePayload(req))

        return res.status(200).json({message: "Profile updated successfully", profile: updatedProfile})

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

app.get('/recruiter/dashboard', verifyJWT, async(req, res) => {
    try{
        if(req.user.role !== "Recruiter"){
            return res.status(403).json({message: "Only recruiter can view dashboard."})
        }

        const jobs = await PostJob.find({ postedBy: req.user.id }).select('_id status')
        const activeJobs = jobs.filter((job) => job.status !== "Archived").length
        const archivedJobs = jobs.filter((job) => job.status === "Archived").length
        const jobIds = jobs.map((job) => job._id)

        const applications = await Application.find({ job: { $in: jobIds } }).select('status')
        const totalApplications = applications.length
        const totalShortlisted = applications.filter((item) => item.status === "Shortlisted").length

        const recentApplicants = await Application.find({
            job: { $in: jobIds },
            status: { $ne: "Withdrawn" }
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('applicant', 'fullName email')
            .populate('job', 'jobTitle')

        return res.status(200).json({
            activeJobs,
            archivedJobs,
            totalApplications,
            totalShortlisted,
            recentApplicants
        })
    }catch(error){
        return res.status(500).json({message: "Failed to fetch dashboard", error: error.message})
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

        if(isApplicationClosed(job.applicationDeadline)){
            return res.status(400).json({message: "Application deadline has passed."})
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

app.get('/jobs/:id/similar', async(req, res) => {
    try{
        const job = await PostJob.findById(req.params.id)
        if(!job){
            return res.status(404).json({message: "Job not found."})
        }

        const similarJobs = await PostJob.find({
            _id: { $ne: job._id },
            status: { $ne: "Archived" },
            $or: [
                { location: job.location },
                { jobType: job.jobType },
                { employmentType: job.employmentType },
                { requiredSkills: { $in: job.requiredSkills || [] } }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(5)

        return res.status(200).json(similarJobs)
    }catch(error){
        return res.status(500).json({message: "Failed to fetch similar jobs", error: error.message})
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
