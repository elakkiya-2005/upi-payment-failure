// Dummy failure spike early warning alerts.

export const spikeAlerts = [
  {
    id: "SPK-001",
    title: "High Failure Spike Detected",
    subsystem: "Google Pay",
    type: "Payment App",
    period: "08 Sep 2026, 7:00 PM – 9:00 PM",
    failureRate: 38,
    baselineRate: 12,
    severity: "high",
    affectedTransactions: 142,
    recommendedAction:
      "Avoid large transactions during this window. Switch to a different payment app or retry after 9:30 PM.",
    status: "active",
  },
  {
    id: "SPK-002",
    title: "Moderate Failure Spike Detected",
    subsystem: "HDFC Bank",
    type: "Bank",
    period: "07 Sep 2026, 1:00 PM – 3:00 PM",
    failureRate: 22,
    baselineRate: 9,
    severity: "medium",
    affectedTransactions: 67,
    recommendedAction:
      "Bank server instability detected. Retry after 4:00 PM or use a different bank account.",
    status: "active",
  },
  {
    id: "SPK-003",
    title: "High Failure Spike Detected",
    subsystem: "PhonePe",
    type: "Payment App",
    period: "05 Sep 2026, 10:00 AM – 12:00 PM",
    failureRate: 31,
    baselineRate: 11,
    severity: "high",
    affectedTransactions: 95,
    recommendedAction:
      "Peak hour congestion on PhonePe. Use BHIM UPI or Google Pay as an alternative.",
    status: "active",
  },
  {
    id: "SPK-004",
    title: "Network Failure Spike Detected",
    subsystem: "3G Network",
    type: "Network Type",
    period: "04 Sep 2026, all day",
    failureRate: 27,
    baselineRate: 10,
    severity: "medium",
    affectedTransactions: 51,
    recommendedAction:
      "3G connections are unstable today. Switch to 4G or Wi-Fi before making payments.",
    status: "resolved",
  },
  {
    id: "SPK-005",
    title: "Low Failure Spike Detected",
    subsystem: "State Bank of India",
    type: "Bank",
    period: "03 Sep 2026, 8:00 AM – 10:00 AM",
    failureRate: 15,
    baselineRate: 8,
    severity: "low",
    affectedTransactions: 22,
    recommendedAction:
      "Minor increase in failures during morning rush hour. No special action needed.",
    status: "resolved",
  },
  {
    id: "SPK-006",
    title: "Moderate Failure Spike Detected",
    subsystem: "Paytm",
    type: "Payment App",
    period: "02 Sep 2026, 8:00 PM – 10:00 PM",
    failureRate: 20,
    baselineRate: 9,
    severity: "medium",
    affectedTransactions: 44,
    recommendedAction:
      "Evening congestion on Paytm. Schedule payments before 8:00 PM or retry after 10:30 PM.",
    status: "resolved",
  },
];

// Dummy chart data used by the admin dashboard.
export const chartData = {
  successVsFailure: [
    { name: "Successful", value: 94 },
    { name: "Failed", value: 26 },
  ],
  failureByApp: [
    { name: "Google Pay", failed: 34 },
    { name: "PhonePe", failed: 41 },
    { name: "Paytm", failed: 22 },
    { name: "Amazon Pay", failed: 14 },
    { name: "BHIM UPI", failed: 9 },
  ],
  failureByTime: [
    { name: "6–9 AM", value: 7 },
    { name: "9 AM–12 PM", value: 24 },
    { name: "12–4 PM", value: 16 },
    { name: "4–7 PM", value: 12 },
    { name: "7–10 PM", value: 33 },
    { name: "10 PM–6 AM", value: 8 },
  ],
  failureByNetwork: [
    { name: "Wi-Fi", value: 8 },
    { name: "5G", value: 12 },
    { name: "4G", value: 26 },
    { name: "3G", value: 38 },
    { name: "2G", value: 16 },
  ],
  riskDistribution: [
    { name: "Low Risk", value: 61 },
    { name: "Medium Risk", value: 24 },
    { name: "High Risk", value: 15 },
  ],
};