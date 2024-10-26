const mongoose = require('mongoose')


const Schema = mongoose.Schema

const DashboardComponentSchema = new Schema({
    componentId: {
        type: String,
        required: true
      },
      order: {
        type: Number,
        required: true
      },
      settings: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      }
})

const DashboardPreferenceSchema = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
      },
      components: [DashboardComponentSchema],
      lastUpdated: {
        type: Date,
        default: Date.now
      }
})

module.exports = mongoose.model('DashboardPreference', DashboardPreferenceSchema);

