const { GoogleGenAI } = require('@google/genai');

let ai;
try {
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } else {
    console.warn('GEMINI_API_KEY is not set. Chatbot will use fallback responses.');
  }
} catch (err) {
  console.error('Failed to initialize Google Gen AI:', err);
}

const SYSTEM_INSTRUCTION = `You are the LEDGR Guide, an AI assistant for the LEDGR finance management platform.
LEDGR is built for retail businesses in Kenya (boutiques, supermarkets, etc.).
Keep your responses short (2-4 sentences max), friendly, and helpful. Use emojis sparingly.
If asked what LEDGR does, explain these core features briefly:
1. Income Tracking (manual or via M-Pesa)
2. Auto-billing (recurring bills paid via Daraja API)
3. Employee & Payroll management
4. Analytics & Trend forecasting
5. Tax management (VAT, PAYE)
6. Auto-savings allocation

If you don't know the answer, politely say you only assist with LEDGR platform questions.`;

// Fallback responses for when the API is unavailable
const FALLBACK_RESPONSES = {
  tour: "👋 Welcome to LEDGR! Here's what we offer:\n\n📊 **Income Tracking** — Log daily sales manually or via M-Pesa integration.\n\n⚡ **Auto-billing** — Schedule recurring payments for utilities and suppliers, paid automatically via M-Pesa Daraja.\n\n👥 **Employee & Payroll** — Manage staff, departments, and run monthly payroll with automatic PAYE, NHIF & NSSF deductions.\n\n📈 **Analytics & Forecasting** — See trends, charts, and AI-powered predictions for your business.\n\n🧾 **Tax Management** — Track VAT, PAYE, and generate KRA-ready reports.\n\n🐷 **Auto-savings** — Automatically allocate a percentage of net income to savings.\n\nWhat would you like to know more about?",
  income: "💰 Go to **Income → Record Income**. Enter the date, amount, payment method (Cash, M-Pesa, Card) and an optional description. LEDGR keeps a running total and shows trends in Analytics.",
  billing: "🤖 Go to **Billing → Add Schedule**. Set the utility name, amount, day of month, and the M-Pesa paybill or account number. LEDGR will trigger the STK Push automatically on that day.",
  employees: "👥 Go to **Employees → Add Employee**. Fill in name, department, salary, and payment method. Payroll runs automatically at end of month.",
  payroll: "💸 Go to **Payroll → Run Payroll**. LEDGR calculates gross pay, PAYE, NHIF, NSSF, and net pay for each employee. Admin approves the run, then M-Pesa payments are sent.",
  analytics: "📈 The Analytics section shows income vs expenses trend lines, weekly bar charts, category breakdowns, and month-over-month comparisons.",
  tax: "🧾 LEDGR tracks VAT (16%), PAYE for payroll, and generates monthly tax summaries formatted for KRA compliance.",
  savings: "🐷 Go to Settings to set your savings rate (default 10%). LEDGR automatically calculates your savings allocation from net income each month.",
  dashboard: "📊 The dashboard shows your key numbers at a glance — income, expenses, net income, and savings for the current month.",
  default: "I'm the LEDGR Guide! I can help you learn about our platform's features. Try asking about income tracking, billing, employees, payroll, analytics, tax, or savings!"
};

function getFallbackResponse(text) {
  const lower = text.toLowerCase();
  if (lower.includes('tour') || lower.includes('feature') || lower.includes('what')) return FALLBACK_RESPONSES.tour;
  if (lower.includes('income') || lower.includes('sales') || lower.includes('revenue')) return FALLBACK_RESPONSES.income;
  if (lower.includes('bill') || lower.includes('electric') || lower.includes('water') || lower.includes('wifi')) return FALLBACK_RESPONSES.billing;
  if (lower.includes('employ') || lower.includes('staff') || lower.includes('worker')) return FALLBACK_RESPONSES.employees;
  if (lower.includes('payroll') || lower.includes('salary')) return FALLBACK_RESPONSES.payroll;
  if (lower.includes('analytic') || lower.includes('chart') || lower.includes('trend') || lower.includes('forecast')) return FALLBACK_RESPONSES.analytics;
  if (lower.includes('tax') || lower.includes('vat') || lower.includes('paye') || lower.includes('kra')) return FALLBACK_RESPONSES.tax;
  if (lower.includes('sav')) return FALLBACK_RESPONSES.savings;
  if (lower.includes('dashboard')) return FALLBACK_RESPONSES.dashboard;
  return FALLBACK_RESPONSES.default;
}

exports.handleChat = async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const lastUserMessage = messages[messages.length - 1]?.text || '';

    // If no API key, use fallback immediately
    if (!ai) {
      return res.json({ response: getFallbackResponse(lastUserMessage) });
    }

    // Try Gemini API
    try {
      const contents = messages.map(msg => ({
        role: msg.role === 'bot' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
        }
      });

      return res.json({ response: response.text });
    } catch (apiErr) {
      console.error('Gemini API error, falling back:', apiErr.message || apiErr);
      // Fall back to keyword matching if the API fails (quota, network, etc.)
      return res.json({ response: getFallbackResponse(lastUserMessage) });
    }

  } catch (err) {
    console.error('Chat handler error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
