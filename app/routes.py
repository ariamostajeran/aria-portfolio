from flask import Blueprint, render_template
from .data_fetcher import get_latest_signals

main = Blueprint('main', __name__)


@main.route('/')
def index():
    return render_template('index.html')


@main.route('/projects/stock-mlops')
def stock_mlops():
    data = get_latest_signals()
    return render_template('stock_mlops.html', data=data)
