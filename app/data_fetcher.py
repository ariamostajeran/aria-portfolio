import os
import json
import time
import base64
import requests
from datetime import datetime

DATABRICKS_HOST = os.environ.get('DATABRICKS_HOST', '')
DATABRICKS_TOKEN = os.environ.get('DATABRICKS_TOKEN', '')
DBFS_PATH = '/portfolio/latest_signals.json'
CACHE_SECONDS = 6 * 3600  # refresh every 6 hours

_cache = {}
_cache_ts = {}


def get_latest_signals():
    now = time.time()
    if 'signals' in _cache and (now - _cache_ts.get('signals', 0)) < CACHE_SECONDS:
        return _cache['signals']

    data = _fetch_from_databricks() if DATABRICKS_HOST and DATABRICKS_TOKEN else _mock_data()
    _cache['signals'] = data
    _cache_ts['signals'] = now
    return data


def _fetch_from_databricks():
    try:
        url = f"{DATABRICKS_HOST}/api/2.0/dbfs/read"
        headers = {'Authorization': f'Bearer {DATABRICKS_TOKEN}'}
        resp = requests.get(url, headers=headers, params={'path': DBFS_PATH}, timeout=10)
        if resp.status_code == 200:
            content = base64.b64decode(resp.json()['data']).decode('utf-8')
            return json.loads(content)
    except Exception:
        pass
    return _mock_data()


def _mock_data():
    return {
        'last_updated': datetime.now().strftime('%Y-%m-%d'),
        'signals': [
            {'ticker': 'AAPL', 'signal': 'LONG',     'probability': 0.72, 'confidence': 'High',   'direction': 'UP'},
            {'ticker': 'TSLA', 'signal': 'NO_TRADE',  'probability': 0.51, 'confidence': 'Low',    'direction': 'FLAT'},
            {'ticker': 'MSFT', 'signal': 'SHORT',     'probability': 0.35, 'confidence': 'Medium', 'direction': 'DOWN'},
        ],
        'backtest': {
            'AAPL': {'hit_rate': 0.58, 'sharpe': 1.23, 'cumulative_return': 34.2, 'trades': 47},
            'TSLA': {'hit_rate': 0.54, 'sharpe': 0.89, 'cumulative_return': 21.1, 'trades': 38},
            'MSFT': {'hit_rate': 0.61, 'sharpe': 1.45, 'cumulative_return': 41.0, 'trades': 52},
        },
        'feature_importance': [
            {'feature': '5d Return',       'importance': 18},
            {'feature': 'VIX Level',       'importance': 15},
            {'feature': 'News Sentiment',  'importance': 13},
            {'feature': 'RSI 14',          'importance': 11},
            {'feature': 'Volume Ratio',    'importance':  9},
            {'feature': 'MA Cross 20/50',  'importance':  8},
            {'feature': 'SPY Correlation', 'importance':  7},
            {'feature': 'Volatility 20d',  'importance':  6},
        ],
        'cumulative_returns': {
            'dates': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            'AAPL': [0, 3,  7, 11, 14, 18, 21, 25, 28, 30, 33, 34],
            'TSLA': [0, 2,  4,  7,  9, 11, 13, 15, 17, 18, 20, 21],
            'MSFT': [0, 4,  8, 13, 17, 21, 25, 29, 33, 36, 39, 41],
        },
    }
