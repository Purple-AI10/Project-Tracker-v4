
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'Server running', timestamp: new Date().toISOString() });
});

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log('Remember to fill in your email password in server.js line 15');
});
