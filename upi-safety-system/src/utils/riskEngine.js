// Dummy risk analysis engine for demonstration purposes

const PAYMENT_APPS = ['Google Pay', 'PhonePe', 'Paytm', 'BHIM UPI'];

const BANKS = [
  'HDFC Bank',
  'SBI',
  'ICICI Bank',
  'Axis Bank',
  'PNB',
];

const NETWORK_RISK = {
  'Wi-Fi': 5,
  '4G': 20,
  '3G': 55,
  '2G': 80,
};

// Historical failure rate model (percentage failure by hour of day)
function getTimeRisk(time, type) {
  const hour = parseInt(time.split(':')[0], 10);

  // Peak transaction hours in India: 8-9 AM, 8-11 PM
  const peakMorning = hour >= 8 && hour <= 10;
  const peakEvening = hour >= 19 && hour <= 23;

  const amountMultiplier = type === 'Fund Transfer' ? 1.3 : 1;

  if (peakMorning || peakEvening) {
    return Math.round((55 + Math.abs(hour - (hour >= 12 ? 21 : 9)) * 3) * amountMultiplier);
  }
  return Math.round((20 + Math.abs(hour - 12) * 2) * amountMultiplier);
}

function getHistoricalRisk(amount) {
  if (amount > 40000) return 75;
  if (amount > 20000) return 55;
  if (amount > 10000) return 38;
  if (amount > 5000) return 20;
  return 8;
}

function getDeviceRisk(device) {
  if (device === 'Laptop') return 5;
  if (device === 'Tablet') return 15;
  if (device === 'Smartphone') return 25;
  return 10;
}

// Main function to analyse failure risk
export function analyzeRisk({ amount, time, paymentApp, bank, deviceType, networkType, transactionType }) {
  const timeRisk = getTimeRisk(time, transactionType);
  const networkRisk = NETWORK_RISK[networkType] || 20;
  const historicalRisk = getHistoricalRisk(parseFloat(amount) || 0);
  const deviceRisk = getDeviceRisk(deviceType);

  // Build up possible risk factors
  const riskFactors = [];

  const hour = parseInt(time.split(':')[0], 10);
  if (hour >= 19 && hour <= 23) {
    riskFactors.push('Peak transaction hour (evening)');
  } else if (hour >= 8 && hour <= 10) {
    riskFactors.push('Peak transaction hour (morning)');
  } else {
    riskFactors.push('Transaction during moderate activity hours');
  }

  if (NETWORK_RISK[networkType] >= 55) {
    riskFactors.push('Poor network type (' + networkType + ')');
  }

  if (historicalRisk >= 55) {
    riskFactors.push('Historical failures under similar conditions');
  }

  if (amount > 30000) {
    riskFactors.push('High transaction amount may exceed bank limit');
  }

  if (riskFactors.length === 0) {
    riskFactors.push('No major risk factors identified');
  }

  // Weighted risk score
  let score = Math.round(
    timeRisk * 0.35 + networkRisk * 0.3 + historicalRisk * 0.25 + deviceRisk * 0.1
  );

  score = Math.max(2, Math.min(98, score));

  let level = 'Low';
  let recommendation =
    'Transaction looks safe. You can proceed with confidence. Check your network stability as a precaution.';

  if (score >= 60) {
    level = 'High';
    recommendation =
      'Try again during a lower-risk time period or use a more stable network connection. Consider splitting large amounts.';
  } else if (score >= 35) {
    level = 'Medium';
    recommendation =
      'Risk is moderate. You can proceed, but prefer a stable network (Wi-Fi/4G) and avoid peak hours if possible.';
  }

  return {
    riskScore: score,
    riskLevel: level,
    riskFactors,
    recommendation,
    hour,
    networkType,
    amount,
    paymentApp,
    bank,
    deviceType,
    transactionType,
  };
}

export const dropdownOptions = {
  paymentApps: PAYMENT_APPS,
  banks: BANKS,
  networkTypes: ['Wi-Fi', '4G', '3G', '2G'],
  deviceTypes: ['Smartphone', 'Tablet', 'Laptop'],
  transactionTypes: ['P2P Transfer', 'Merchant Payment', 'Bill Payment', 'Fund Transfer'],
};