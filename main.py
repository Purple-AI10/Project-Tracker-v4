from flask import Flask, send_from_directory

app = Flask(__name__)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/styles.css')
def styles():
    return send_from_directory('.', 'styles.css')

@app.route('/script.js')
def script():
    return send_from_directory('.', 'script.js')

@app.route('/mikro-logo.svg')
def logo():
    return send_from_directory('.', 'mikro-logo.svg')

@app.route('/image.png')
def favicon():
    return send_from_directory('.', 'image.png')


if __name__ == '__main__':
    print("Starting Project Tracker server...")
    print("Access your app at: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)