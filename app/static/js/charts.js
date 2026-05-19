// Shared dark-theme defaults for all charts
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
Chart.defaults.font.family = 'Inter, sans-serif';

const CYAN   = '#06b6d4';
const CYAN10 = 'rgba(6,182,212,0.10)';
const CYAN70 = 'rgba(6,182,212,0.70)';

// ── CUMULATIVE RETURNS LINE CHART ─────────────────────────────
const returnsCtx = document.getElementById('returnsChart');
if (returnsCtx) {
  new Chart(returnsCtx, {
    type: 'line',
    data: {
      labels: returnsData.dates,
      datasets: [
        {
          label: 'AAPL',
          data: returnsData.AAPL,
          borderColor: CYAN,
          backgroundColor: CYAN10,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: CYAN,
          borderWidth: 2,
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#94a3b8', usePointStyle: true, pointStyleWidth: 10 }
        },
        tooltip: {
          backgroundColor: '#1a2236',
          borderColor: 'rgba(6,182,212,0.3)',
          borderWidth: 1,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxRotation: 0 },
          grid:  { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: {
            color: '#94a3b8',
            callback: v => v + '%'
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

// ── FEATURE IMPORTANCE HORIZONTAL BAR CHART ───────────────────
const featureCtx = document.getElementById('featureChart');
if (featureCtx) {
  new Chart(featureCtx, {
    type: 'bar',
    data: {
      labels: featureData.map(f => f.feature),
      datasets: [
        {
          data: featureData.map(f => f.importance),
          backgroundColor: CYAN70,
          borderColor: CYAN,
          borderWidth: 1,
          borderRadius: 4,
          hoverBackgroundColor: CYAN,
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2236',
          borderColor: 'rgba(6,182,212,0.3)',
          borderWidth: 1,
          callbacks: {
            label: ctx => ` Importance: ${ctx.parsed.x}%`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', callback: v => v + '%' },
          grid:  { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid:  { display: false }
        }
      }
    }
  });
}
