const mongoose = require('mongoose')
require('dotenv').config()

const mongoUri = process.env.MONGODB
console.log(!!mongoUri, "mongodb uri exist")

const connectDB = async() => {
    try{
        await mongoose.connect(mongoUri)
        console.log("Connected to Database")

    }catch(error){
        console.log(error)
        console.log("Error while connecting to database")
    }
}

module.exports = {connectDB}