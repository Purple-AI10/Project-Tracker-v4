
"""
Project Tracker - Flask Web Application
======================================

This is a Flask-based web application for project management and tracking.
It serves static files for a project tracking dashboard.

Main Components:
- Flask web server running on port 5000
- Static file serving for HTML, CSS, JS, and assets
- CORS enabled for cross-origin requests

Usage:
- Run this file to start the Flask development server
- Access the application at http://localhost:5000
- The app will serve the main HTML file and all static assets

Dependencies:
- Flask: Web framework for Python
- All static files must be in the same directory as this script

Debugging Tips:
- Check console output for any Flask errors
- Ensure all static files (HTML, CSS, JS) exist in the current directory
- Verify port 5000 is not being used by another process
- Use debug=True for detailed error messages in development
"""

from flask import Flask, send_from_directory

# Initialize Flask application
app = Flask(__name__)

# Route handlers for serving static files
# Each route serves a specific file type needed by the web application

@app.route('/')
def index():
    """
    Serve the main HTML file (index.html)
    This is the entry point for the web application
    """
    return send_from_directory('.', 'index.html')

@app.route('/styles.css')
def styles():
    """
    Serve the CSS stylesheet
    Contains all styling for the project tracker interface
    """
    return send_from_directory('.', 'styles.css')

@app.route('/script.js')
def script():
    """
    Serve the main JavaScript file
    Contains all client-side logic for project management
    """
    return send_from_directory('.', 'script.js')

@app.route('/mikro-logo.svg')
def logo():
    """
    Serve the company logo SVG file
    Used in the sidebar header
    """
    return send_from_directory('.', 'mikro-logo.svg')

@app.route('/image.png')
def favicon():
    """
    Serve the favicon image
    Browser tab icon for the application
    """
    return send_from_directory('.', 'image.png')

# Application entry point
if __name__ == '__main__':
    print("="*50)
    print("STARTING PROJECT TRACKER SERVER")
    print("="*50)
    print("✓ Flask application initialized")
    print("✓ Static file routes configured")
    print("✓ Debug mode enabled for development")
    print("="*50)
    print("🌐 Access your app at: http://localhost:5000")
    print("🔧 For debugging, check console output below")
    print("="*50)
    
    # Start the Flask development server
    # host='0.0.0.0' allows external connections
    # port=5000 is the standard development port
    # debug=True provides detailed error messages and auto-reload
    app.run(host='0.0.0.0', port=5000, debug=True)
