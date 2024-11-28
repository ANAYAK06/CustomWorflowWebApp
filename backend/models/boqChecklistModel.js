const mongoose = require('mongoose')


const Schema = mongoose.Schema

const boqChecklistSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true,
      unique: true  // To ensure checklist names are unique
    },
    items: [{
      description: {
        type: String,
        required: true
      },
      // Add any additional fields you need for each item
      createdAt: {
        type: Date,
        default: Date.now
      }
    }]
  });

module.exports = mongoose.model('boqChecklist', boqChecklistSchema)