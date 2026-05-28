import os
import requests as http_requests
from flask import Blueprint, render_template, request, jsonify
from .data_fetcher import get_latest_signals

main = Blueprint('main', __name__)


@main.route('/')
def index():
    return render_template('index.html')


@main.route('/projects/stock-mlops')
def stock_mlops():
    data = get_latest_signals()
    return render_template('stock_mlops.html', data=data)


@main.route('/projects/scoutball')
def scoutball():
    return render_template('scoutball.html')


@main.route('/projects/assistant')
def assistant_project():
    return render_template('assistant_project.html')


@main.route('/api/assistant/chat', methods=['POST'])
def assistant_chat():
    api_url = os.environ.get('ASSISTANT_API_URL', '').rstrip('/')
    if not api_url:
        return jsonify({'offline': True, 'response': 'Assistant is not configured yet.'}), 503
    try:
        resp = http_requests.post(
            f"{api_url}/api/chat",
            json=request.get_json(),
            timeout=35,
        )
        return jsonify(resp.json()), resp.status_code
    except Exception:
        return jsonify({'offline': True, 'response': 'Assistant is warming up, please try again in a moment.'}), 503
