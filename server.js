
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises;

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Email configuration - FILL IN YOUR PASSWORD HERE
const transporter = nodemailer.createTransport({
    service: 'gmail', // or your email service
    auth: {
        user: 'projects@mikroindia.com',
        pass: 'uMso7;4A)t{s' // TODO: FILL IN YOUR EMAIL PASSWORD HERE
    }
});

// Email sending endpoint
app.post('/send-email', async (req, res) => {
    try {
        const { to, subject, text, html } = req.body;
        
        const mailOptions = {
            from: 'projects@mikroindia.com',
            to: to,
            subject: subject,
            text: text,
            html: html
        };

        const result = await transporter.sendMail(mailOptions);
        res.json({ success: true, messageId: result.messageId });
    } catch (error) {
        console.error('Email sending error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// OTDR update endpoint
app.post('/update-otdr', async (req, res) => {
    try {
        const { projectId, projectName, stageName, dueDate, completed, completedDate } = req.body;
        const filePath = path.join(__dirname, 'otdr-data', `${stageName}-otdr.json`);
        
        // Read existing OTDR data
        let otdrData;
        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            otdrData = JSON.parse(fileContent);
        } catch (error) {
            // Create new OTDR data if file doesn't exist
            otdrData = {
                stageName: stageName,
                projects: [],
                totalProjects: 0,
                onTimeProjects: 0,
                otdr: 0
            };
        }
        
        const existingProject = otdrData.projects.find(p => p.projectId === projectId);
        
        if (!existingProject && dueDate) {
            // Add new project to OTDR tracking
            otdrData.projects.push({
                projectId: projectId,
                projectName: projectName,
                dueDate: dueDate,
                completed: completed,
                completedDate: completedDate,
                onTime: null
            });
            otdrData.totalProjects++;
        } else if (existingProject) {
            // Update existing project
            existingProject.completed = completed;
            if (completed && completedDate) {
                existingProject.completedDate = completedDate;
                existingProject.onTime = new Date(completedDate) <= new Date(existingProject.dueDate);
            } else {
                existingProject.completedDate = null;
                existingProject.onTime = null;
            }
        }
        
        // Recalculate OTDR
        const completedProjects = otdrData.projects.filter(p => p.completed);
        otdrData.onTimeProjects = completedProjects.filter(p => p.onTime).length;
        otdrData.otdr = otdrData.totalProjects > 0 ? (otdrData.onTimeProjects / otdrData.totalProjects * 100).toFixed(1) : 0;
        
        // Save updated OTDR data
        await fs.writeFile(filePath, JSON.stringify(otdrData, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating OTDR data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// OTDR reset endpoint
app.post('/reset-otdr', async (req, res) => {
    try {
        const { stageName, data } = req.body;
        const filePath = path.join(__dirname, 'otdr-data', `${stageName}-otdr.json`);
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error resetting OTDR data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log('Remember to fill in your email password in server.js line 15');
});
