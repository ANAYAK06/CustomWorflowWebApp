const mongoose = require('mongoose');
const BOQChecklist = require('../../models/boqChecklistModel');


const getAllChecklists = async (req, res) => {
    try {
        const checklists = await BOQChecklist.find({}, 'name');
        res.status(200).json({
            success: true,
            data: checklists
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching checklists',
            error: error.message
        });
    }
};

const createChecklist = async (req, res) => {
    try {
        const { name, items } = req.body;
        
        // Check if checklist with same name exists
        const existingChecklist = await BOQChecklist.findOne({ name });
        if (existingChecklist) {
            return res.status(400).json({
                success: false,
                message: 'Checklist with this name already exists'
            });
        }

        const newChecklist = new BOQChecklist({
            name,
            items: items || [] // If no items provided, initialize with empty array
        });

        await newChecklist.save();

        res.status(201).json({
            success: true,
            message: 'Checklist created successfully',
            data: newChecklist
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating checklist',
            error: error.message
        });
    }
};

const getChecklistById = async (req, res) => {
    try {
        const checklist = await BOQChecklist.findById(req.params.id);
        if (!checklist) {
            return res.status(404).json({
                success: false,
                message: 'Checklist not found'
            });
        }

        res.status(200).json({
            success: true,
            data: checklist
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching checklist',
            error: error.message
        });
    }
};

const addItemsToChecklist = async (req, res) => {
    try {
        const { items } = req.body;
        const checklistId = req.params.id;

        const checklist = await BOQChecklist.findById(checklistId);
        if (!checklist) {
            return res.status(404).json({
                success: false,
                message: 'Checklist not found'
            });
        }

        // Add new items to existing items array
        checklist.items.push(...items);
        await checklist.save();

        res.status(200).json({
            success: true,
            message: 'Items added successfully',
            data: checklist
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error adding items to checklist',
            error: error.message
        });
    }
};

const updateChecklist = async (req, res) => {
    try {
        const { name, items } = req.body;
        const checklistId = req.params.id;

        const updatedChecklist = await BOQChecklist.findByIdAndUpdate(
            checklistId,
            { name, items },
            { new: true, runValidators: true }
        );

        if (!updatedChecklist) {
            return res.status(404).json({
                success: false,
                message: 'Checklist not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Checklist updated successfully',
            data: updatedChecklist
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating checklist',
            error: error.message
        });
    }
};

const deleteChecklist = async (req, res) => {
    try {
        const checklistId = req.params.id;
        const deletedChecklist = await BOQChecklist.findByIdAndDelete(checklistId);

        if (!deletedChecklist) {
            return res.status(404).json({
                success: false,
                message: 'Checklist not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Checklist deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting checklist',
            error: error.message
        });
    }
};

module.exports = {
    getAllChecklists,
    createChecklist,
    getChecklistById,
    addItemsToChecklist,
    updateChecklist,
    deleteChecklist
};