import os
import sys
import json
import urllib.request
from flask import Flask, send_from_directory

app = Flask(__name__, static_folder='dist')

dist_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist')
if not os.path.exists(dist_path):
    print("\nWARNING: 'dist' folder not found. Please run 'npm run build' first to compile the React frontend!")

# API route to proxy requests to Supabase (bypassing the browser restriction on secret API keys)
@app.route('/api/questions')
def get_questions():
    url = "https://nermiqdqttseudbeqwll.supabase.co/rest/v1/quiz_questions?select=*,quiz_options(*)"
    headers = {
        "apikey": "sb_secret_rf9eKTcOhrNcss0G5eVQyQ_EY1d2Xwk",
        "Authorization": "Bearer sb_secret_rf9eKTcOhrNcss0G5eVQyQ_EY1d2Xwk"
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            data = response.read()
            return app.response_class(
                response=data,
                status=200,
                mimetype='application/json'
            )
    except Exception as e:
        print(f"[ERROR] Failed to fetch data from Supabase: {e}")
        return json.dumps({"error": str(e)}), 500

# Route to serve the main entry point
@app.route('/')
def index():
    if os.path.exists(os.path.join(dist_path, 'index.html')):
        return send_from_directory(dist_path, 'index.html')
    else:
        return (
            "<h1>React Frontend not compiled!</h1>"
            "<p>Please compile the frontend by running <code>npm run build</code> in the directory: <b>" + os.path.dirname(os.path.abspath(__file__)) + "</b></p>"
        ), 404

# Route to serve any static assets or files
@app.route('/<path:path>')
def static_proxy(path):
    if os.path.exists(os.path.join(dist_path, path)):
        return send_from_directory(dist_path, path)
    return send_from_directory(dist_path, 'index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"\n[INFO] Flask server running at http://localhost:{port}")
    print(f"[INFO] Serving compiled React application from: {dist_path}\n")
    app.run(host='0.0.0.0', port=port, debug=True)
