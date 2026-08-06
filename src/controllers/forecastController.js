const { query } = require('../../config/database');
const ss = require('simple-statistics');

// Helper for Exponential Moving Average
function calculateEMA(values, alpha = 0.3) {
  if (!values || values.length === 0) return [];
  
  let ema = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(alpha * values[i] + (1 - alpha) * ema[i - 1]);
  }
  return ema;
}

// Main forecast function
function forecastSeries(monthlyData) {
  if (!monthlyData || monthlyData.length < 3) {
    return null; // Not enough data
  }
  
  // Convert to [index, value] format for simple-statistics
  const dataPoints = monthlyData.map((d, i) => [i, d.value]);
  const values = monthlyData.map(d => d.value);
  
  // 1. Linear Regression
  const regression = ss.linearRegression(dataPoints);
  const regressionLine = ss.linearRegressionLine(regression);
  const rSquared = ss.rSquared(dataPoints, regressionLine);
  
  // 2. Exponential Moving Average
  const emaValues = calculateEMA(values, 0.3);
  
  // Calculate residuals to find standard deviation for confidence bands
  const residuals = [];
  for (let i = 0; i < values.length; i++) {
    // We blend historical fit to calculate historical residuals
    const regFit = regressionLine(i);
    const emaFit = emaValues[i];
    const blendedFit = (0.6 * regFit) + (0.4 * emaFit);
    residuals.push(values[i] - blendedFit);
  }
  
  const stddev = ss.standardDeviation(residuals);
  
  // Forecast next 6 months
  const predictions = [];
  const confidence = [];
  
  const lastIndex = values.length - 1;
  let lastEma = emaValues[lastIndex];
  
  for (let i = 1; i <= 6; i++) {
    const futureIndex = lastIndex + i;
    
    // Regression prediction
    const regPred = regressionLine(futureIndex);
    
    // EMA prediction for future (flattens out essentially, using last EMA)
    // A simple approach is just to use the last EMA for future periods
    // but a slightly better one might continue blending.
    const emaPred = lastEma; 
    
    // Blend: 60% regression, 40% WMA
    const blendedPred = (0.6 * regPred) + (0.4 * emaPred);
    // Prevent negative predictions for things that shouldn't be negative
    const finalPred = Math.max(0, blendedPred);
    
    predictions.push(finalPred);
    
    // Confidence bands (± 1.5 stddev), widening slightly over time
    const uncertaintyMultiplier = 1 + (i * 0.1); 
    const margin = 1.5 * stddev * uncertaintyMultiplier;
    
    confidence.push({
      upper: finalPred + margin,
      lower: Math.max(0, finalPred - margin)
    });
  }
  
  return {
    predictions,
    confidence,
    rSquared,
    slope: regression.m
  };
}

function generateInsights(incomeForecast, expenseForecast, netPredictions) {
  const insights = [];
  
  if (!incomeForecast || !expenseForecast) return insights;
  
  // Income trend
  if (incomeForecast.slope > 0) {
    insights.push({ icon: '📈', text: 'Income is showing an upward trend over the period.', type: 'positive' });
  } else if (incomeForecast.slope < 0) {
    insights.push({ icon: '📉', text: 'Income is showing a slight downward trend.', type: 'negative' });
  }
  
  // Expense trend
  if (expenseForecast.slope > 0) {
    insights.push({ icon: '⚠️', text: 'Expenses are trending upwards. Monitor spending.', type: 'negative' });
  } else if (expenseForecast.slope < 0) {
    insights.push({ icon: '📉', text: 'Expenses are trending down. Great job saving!', type: 'positive' });
  }
  
  // Net positive/negative
  const nextMonthNet = netPredictions[0];
  if (nextMonthNet > 0) {
    insights.push({ icon: '💰', text: 'Expected positive cash flow next month.', type: 'positive' });
  } else {
    insights.push({ icon: '🔴', text: 'Potential negative cash flow next month. Plan accordingly.', type: 'negative' });
  }
  
  return insights;
}

const monthsList = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

async function getForecastData(req) {
  const business_id = req.user.business_id;
  
  // Query income for last 24 months
  const incomeResult = await query(
    `SELECT EXTRACT(MONTH FROM date)::int AS month, EXTRACT(YEAR FROM date)::int AS year, SUM(amount) AS total 
     FROM income_records 
     WHERE business_id = $1 AND date >= NOW() - INTERVAL '24 months' 
     GROUP BY year, month 
     ORDER BY year, month`,
    [business_id]
  );
  
  // Query expenses for last 24 months
  const expenseResult = await query(
    `SELECT EXTRACT(MONTH FROM date)::int AS month, EXTRACT(YEAR FROM date)::int AS year, SUM(amount) AS total 
     FROM expenses 
     WHERE business_id = $1 AND date >= NOW() - INTERVAL '24 months' 
     GROUP BY year, month 
     ORDER BY year, month`,
    [business_id]
  );

  // Determine full range of months
  const allMonths = [];
  const now = new Date();
  let currentMonth = now.getMonth() + 1;
  let currentYear = now.getFullYear();
  
  // Start from 23 months ago to get 24 months total
  let startMonth = currentMonth - 23;
  let startYear = currentYear;
  if (startMonth <= 0) {
    startMonth += 12;
    startYear -= 1;
  }
  
  for (let i = 0; i < 24; i++) {
    allMonths.push({ month: startMonth, year: startYear });
    startMonth++;
    if (startMonth > 12) {
      startMonth = 1;
      startYear++;
    }
  }

  // Fill in missing months with 0
  const incomeData = allMonths.map(m => {
    const found = incomeResult.rows.find(r => r.month === m.month && r.year === m.year);
    return { ...m, value: found ? parseFloat(found.total) : 0 };
  });

  const expenseData = allMonths.map(m => {
    const found = expenseResult.rows.find(r => r.month === m.month && r.year === m.year);
    return { ...m, value: found ? parseFloat(found.total) : 0 };
  });

  // Calculate if we have enough data (at least 3 non-zero months for both)
  const nonZeroIncome = incomeData.filter(d => d.value > 0).length;
  const nonZeroExpenses = expenseData.filter(d => d.value > 0).length;
  const hasData = nonZeroIncome >= 3 || nonZeroExpenses >= 3;

  if (!hasData) {
    return { hasData: false };
  }

  const incomeForecast = forecastSeries(incomeData);
  const expenseForecast = forecastSeries(expenseData);
  
  if (!incomeForecast || !expenseForecast) {
    return { hasData: false };
  }

  const netPredictions = [];
  for (let i = 0; i < 6; i++) {
    netPredictions.push(incomeForecast.predictions[i] - expenseForecast.predictions[i]);
  }

  const insights = generateInsights(incomeForecast, expenseForecast, netPredictions);
  
  // Future labels
  let nextMonth = currentMonth + 1;
  let nextYear = currentYear;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  
  const futureLabels = [];
  for(let i=0; i<6; i++) {
    futureLabels.push(`${monthsList[nextMonth-1]} ${nextYear}`);
    nextMonth++;
    if(nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
  }

  const labels = [
    ...allMonths.map(m => `${monthsList[m.month - 1]} ${m.year}`),
    ...futureLabels
  ];

  // Prepare chart data
  // For visual continuity, the forecast lines should start at the last historical point
  const lastIncomeValue = incomeData[incomeData.length - 1].value;
  const lastExpenseValue = expenseData[expenseData.length - 1].value;

  const chartData = {
    labels,
    incomeHistory: [...incomeData.map(d => d.value), ...Array(6).fill(null)],
    expenseHistory: [...expenseData.map(d => d.value), ...Array(6).fill(null)],
    netHistory: [...incomeData.map((d, i) => d.value - expenseData[i].value), ...Array(6).fill(null)],
    
    // Null pad historical (except last point for continuity)
    incomeForecast: [
      ...Array(23).fill(null),
      lastIncomeValue,
      ...incomeForecast.predictions
    ],
    expenseForecast: [
      ...Array(23).fill(null),
      lastExpenseValue,
      ...expenseForecast.predictions
    ],
    netForecast: [
      ...Array(23).fill(null),
      lastIncomeValue - lastExpenseValue,
      ...netPredictions
    ],
    
    incomeUpper: [
      ...Array(23).fill(null),
      lastIncomeValue, // confidence 0 at current point
      ...incomeForecast.confidence.map(c => c.upper)
    ],
    incomeLower: [
      ...Array(23).fill(null),
      lastIncomeValue,
      ...incomeForecast.confidence.map(c => c.lower)
    ],
    expenseUpper: [
      ...Array(23).fill(null),
      lastExpenseValue,
      ...expenseForecast.confidence.map(c => c.upper)
    ],
    expenseLower: [
      ...Array(23).fill(null),
      lastExpenseValue,
      ...expenseForecast.confidence.map(c => c.lower)
    ]
  };

  // Categories query
  const categoryResult = await query(
    `SELECT category_id, name as category_name, EXTRACT(MONTH FROM date)::int AS month, EXTRACT(YEAR FROM date)::int AS year, SUM(amount) AS total
     FROM expenses
     JOIN expense_categories ON expenses.category_id = expense_categories.id
     WHERE expenses.business_id = $1 AND date >= NOW() - INTERVAL '24 months'
     GROUP BY category_id, category_name, year, month
     ORDER BY category_id, year, month`,
    [business_id]
  );

  // Process categories
  const catDataMap = {};
  categoryResult.rows.forEach(row => {
    if (!catDataMap[row.category_name]) {
      catDataMap[row.category_name] = Array(24).fill(0);
    }
    // Find index in allMonths
    const idx = allMonths.findIndex(m => m.month === row.month && m.year === row.year);
    if (idx !== -1) {
      catDataMap[row.category_name][idx] = parseFloat(row.total);
    }
  });

  const categoryForecasts = [];
  for (const [name, dataArr] of Object.entries(catDataMap)) {
    const formattedData = dataArr.map((val, i) => ({ index: i, value: val }));
    const fcast = forecastSeries(formattedData);
    if (fcast) {
      const currentAvg = dataArr.reduce((a, b) => a + b, 0) / 24;
      categoryForecasts.push({
        name,
        currentAvg,
        predicted: fcast.predictions[0],
        trend: fcast.slope > 10 ? 'up' : fcast.slope < -10 ? 'down' : 'stable'
      });
    }
  }

  // Sort by highest predicted
  categoryForecasts.sort((a, b) => b.predicted - a.predicted);

  return {
    hasData: true,
    historical: { income: incomeData, expenses: expenseData },
    predictions: {
      income: incomeForecast.predictions,
      expenses: expenseForecast.predictions,
      net: netPredictions
    },
    confidence: {
      income: incomeForecast.confidence,
      expenses: expenseForecast.confidence
    },
    modelQuality: {
      incomeR2: incomeForecast.rSquared,
      expenseR2: expenseForecast.rSquared
    },
    insights,
    chartData,
    categoryForecasts,
    futureLabels
  };
}

exports.showForecast = async (req, res) => {
  try {
    const data = await getForecastData(req);
    
    if (!data.hasData) {
      return res.render('pages/forecast/index', {
        title: 'Forecast — LEDGR',
        hasData: false,
        user: req.user,
        activePath: '/forecast'
      });
    }

    res.render('pages/forecast/index', {
      title: 'Forecast — LEDGR',
      user: req.user,
      activePath: '/forecast',
      ...data
    });
  } catch (err) {
    console.error('Forecast error:', err);
    res.render('pages/forecast/index', {
      title: 'Forecast Error — LEDGR',
      hasData: false,
      error: 'An error occurred while generating your forecast.',
      user: req.user,
      activePath: '/forecast'
    });
  }
};

exports.apiForecast = async (req, res) => {
  try {
    const data = await getForecastData(req);
    res.json(data);
  } catch (err) {
    console.error('Forecast API error:', err);
    res.status(500).json({ error: 'Failed to generate forecast' });
  }
};
