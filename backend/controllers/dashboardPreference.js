const DashboardPreference = require('../models/dashboardModel')


const dashboardPreferenceController = {
    // Fetch dashboard preferences
    getDashboardPreferences: async (req, res) => {
        try {
            const preferences = await DashboardPreference.findOne({ userId: req.user.id });
            res.json(preferences || { components: [] });
        } catch (error) {
            console.error('Error fetching dashboard preferences:', error);
            res.status(500).json({ message: 'Server error while fetching preferences' });
        }
    },

    // Save dashboard preferences
    saveDashboardPreferences: async (req, res) => {
        try {
            let preferences = await DashboardPreference.findOne({ userId: req.user.id });
            if (preferences) {
                preferences.components = req.body.components;
                preferences.lastUpdated = Date.now();
            } else {
                preferences = new DashboardPreference({
                    userId: req.user.id,
                    components: req.body.components
                });
            }
            await preferences.save();
            res.json(preferences);
        } catch (error) {
            console.error('Error saving dashboard preferences:', error);
            res.status(500).json({ message: 'Server error while saving preferences' });
        }
    }
};

module.exports = {
    dashboardPreferenceController

}