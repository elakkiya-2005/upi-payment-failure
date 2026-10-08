import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import BankPairAnalysisPage from "./pages/BankPairAnalysisPage";
import AnomalyDetectionPage from "./pages/AnomalyDetectionPage";
import DatasetAnalyzerPage from "./pages/DatasetAnalyzerPage";
import { AuthProvider } from "./context/AuthContext";

// react-router-dom v7 ships an "exports" map that the jest
// bundled with react-scripts 5 cannot resolve. Mocking it keeps
// this smoke test focused on the pages themselves.
jest.mock("react-router-dom", () => ({
  MemoryRouter: ({ children }) => <div>{children}</div>,
  NavLink: ({ children }) => <div>{children}</div>,
  Link: ({ children }) => <div>{children}</div>,
  useNavigate: () => () => {},
}));

const bankPairPayload = {
  summary: {
    totalBankPairs: 64,
    totalTransactions: 250000,
    failedTransactions: 12376,
    successfulTransactions: 237624,
    otherTransactions: 0,
    overallFailureRate: 4.95,
  },
  pairs: [
    {
      senderBank: "Axis",
      receiverBank: "Kotak",
      bankPair: "Axis -> Kotak",
      totalTransactions: 2006,
      failedTransactions: 122,
      successfulTransactions: 1884,
      otherTransactions: 0,
      failureRate: 6.08,
    },
    {
      senderBank: "SBI",
      receiverBank: "SBI",
      bankPair: "SBI -> SBI",
      totalTransactions: 15635,
      failedTransactions: 786,
      successfulTransactions: 14849,
      otherTransactions: 0,
      failureRate: 5.03,
    },
  ],
  insights: {
    highestFailureRate: {
      senderBank: "Axis",
      receiverBank: "Kotak",
      totalTransactions: 2006,
      failedTransactions: 122,
      failureRate: 6.08,
    },
    lowestFailureRate: {
      senderBank: "Axis",
      receiverBank: "Yes Bank",
      totalTransactions: 2420,
      failedTransactions: 99,
      failureRate: 4.09,
    },
    mostFailures: {
      senderBank: "SBI",
      receiverBank: "SBI",
      totalTransactions: 15635,
      failedTransactions: 786,
      failureRate: 5.03,
    },
    minVolumeForInsights: 20,
    pairsConsidered: 2,
  },
  filters: {
    senderBanks: ["Axis", "SBI"],
    receiverBanks: ["Kotak", "SBI"],
    transactionTypes: ["P2P", "P2M"],
    dateRange: { min: "2024-01-01", max: "2024-12-30" },
  },
  appliedFilters: {},
  generatedAt: "2026-01-01T00:00:00.000Z",
};

const anomalyPayload = {
  summary: {
    totalAnalyzed: 250000,
    normalTransactions: 0,
    anomalousTransactions: 12500,
    anomalyPercentage: 100,
    datasetAnomalousTransactions: 12500,
    datasetAnomalyPercentage: 5,
    filteredTransactions: 12471,
    filteredAnomalies: 2261,
    unsuccessfulTransactions: 7324,
    averageAmount: 2078.17,
    averageAnomalyScore: 97.5,
    isFiltered: true,
  },
  model: {
    algorithm: "IsolationForest",
    library: "scikit-learn",
    params: { n_estimators: 300, contamination: 0.05 },
    features: ["amount", "hour_of_day", "is_weekend"],
    numericFeatures: ["amount", "hour_of_day", "is_weekend"],
    categoricalFeatures: ["sender_bank", "receiver_bank"],
    trainedAt: "2026-01-01T00:00:00.000Z",
    generatedAt: "2026-01-01T00:00:00.000Z",
    scoreRange: { min: 0, max: 100, mean: 95 },
    amountReference: {
      min: 10,
      max: 42099,
      mean: 1311.75,
      std: 1848.05,
      p01: 48,
      p25: 288,
      median: 629,
      p75: 1596,
      p99: 9003,
      iqr: 1308,
    },
  },
  results: [
    {
      transaction_id: "TXN0000000153",
      timestamp: "2024-01-01 02:14:00",
      amount: 16,
      transaction_type: "P2M",
      sender_bank: "PNB",
      receiver_bank: "PNB",
      network_type: "WiFi",
      device_type: "Android",
      hour_of_day: 2,
      is_weekend: 0,
      transaction_status: "FAILED",
      anomaly_score: 99.23,
      anomaly_status: "ANOMALY",
      reasons: [
        "Amount Rs 16 is below the 1st percentile of the dataset (Rs 48).",
        "This transaction did not succeed, while 95.0% of the dataset did.",
      ],
    },
  ],
  pagination: { page: 1, limit: 25, total: 12500, totalPages: 500 },
  filters: {
    senderBanks: ["PNB", "SBI"],
    receiverBanks: ["PNB", "SBI"],
    networkTypes: ["3G", "WiFi"],
    deviceTypes: ["Android", "Web"],
    transactionTypes: ["P2M", "P2P"],
    statuses: ["ANOMALY", "NORMAL"],
  },
  distribution: {
    byHour: [{ hour: 2, label: "02:00", total: 1685, anomalies: 156, anomalyRate: 9.26 }],
    byNetwork: [{ name: "3G", total: 12471, anomalies: 2261, anomalyRate: 18.13 }],
    byDevice: [{ name: "Web", total: 12610, anomalies: 3108, anomalyRate: 24.65 }],
    byTransactionType: [{ name: "P2M", total: 87660, anomalies: 3000, anomalyRate: 3.42 }],
  },
  scatter: [
    { amount: 16, anomaly_score: 99.23, anomaly_status: "ANOMALY" },
    { amount: 500, anomaly_score: 50, anomaly_status: "NORMAL" },
  ],
  appliedFilters: {},
};

function mockFetchOnce(payload) {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(payload),
    })
  );
}

// Mirrors what the analyzer returns for a real transaction export. The
// shapes are copied from the API response on purpose: the page must not
// be able to render a result the backend does not actually send.
const datasetPayload = {
  file: {
    name: "transactions.csv",
    bytes: 4821,
    rowsInFile: 20000,
    rowsAnalysed: 20000,
    truncated: false,
  },
  analysedAt: "2026-01-01T00:00:00.000Z",
  columns: [
    {
      name: "transaction_status",
      key: "c1",
      role: "status",
      dtype: "object",
      distinct: 2,
      missing: 0,
      missingPercent: 0,
      samples: ["SUCCESS", "FAILED"],
    },
    {
      name: "amount",
      key: "c2",
      role: "amount",
      dtype: "float64",
      distinct: 8123,
      missing: 12,
      missingPercent: 0.06,
      samples: ["500.0", "250.0", "99.0"],
    },
    {
      name: "transaction_id",
      key: "c3",
      role: "identifier",
      dtype: "object",
      distinct: 20000,
      missing: 0,
      missingPercent: 0,
      samples: ["TXN0000000001"],
    },
  ],
  outcome: {
    available: true,
    column: "transaction_status",
    failedValues: ["FAILED"],
    successValues: ["SUCCESS"],
  },
  kpis: [
    { key: "rows", label: "Transactions Analysed", value: 20000, format: "number" },
    { key: "columns", label: "Columns Found", value: 3, format: "number" },
    { key: "amountTotal", label: "Total Amount", value: 25542890, format: "currency" },
    { key: "failureRate", label: "Failure Rate", value: 5.08, format: "percent" },
    { key: "period", label: "Period Covered", value: "01 Jan 2024 to 30 Dec 2024", format: "text" },
  ],
  charts: [
    {
      key: "statusMix",
      title: "Outcome distribution",
      kind: "bar",
      source: "transaction_status",
      entries: [
        { label: "SUCCESS", value: 18984, tone: "ok" },
        { label: "FAILED", value: 1016, tone: "danger" },
      ],
    },
    {
      key: "rate:network_type",
      title: "Failure rate by network",
      kind: "rateBar",
      source: "network_type",
      baselinePercent: 5.08,
      entries: [
        {
          label: "3G",
          value: 6.12,
          lift: 1.205,
          failures: 651,
          total: 10638,
          tone: "danger",
        },
      ],
    },
  ],
  insights: [
    {
      title: "3G fails noticeably more often",
      detail:
        "3G failed 6.12% of the time against a 5.08% baseline, about 1.2x as often.",
      severity: "warning",
    },
  ],
  unsupported: [
    {
      feature: "Grouping by free-text columns",
      reason: "'transaction_id' has 20,000 distinct values, so it is treated as an identifier.",
    },
  ],
};

const datasetWithoutOutcome = {
  ...datasetPayload,
  outcome: {
    available: false,
    column: null,
    failedValues: [],
    successValues: [],
  },
  kpis: datasetPayload.kpis.filter(
    (kpi) => kpi.key !== "failureRate"
  ),
  charts: [],
  insights: [
    {
      title: "No outcome column was found",
      detail:
        "This file has no column that identifies whether a transaction failed, so no failure rate can be measured.",
      severity: "info",
    },
  ],
  unsupported: [
    {
      feature: "Failure rate and failure drivers",
      reason: "No column of transaction outcomes was found.",
    },
  ],
};

// Drives the page the way a user does: choose a file, then analyse it.
async function uploadAndAnalyse(payload) {
  mockFetchOnce(payload);

  render(
    <MemoryRouter>
      <AuthProvider>
        <DatasetAnalyzerPage user={user} />
      </AuthProvider>
    </MemoryRouter>
  );

  const csv =
    "transaction_id,timestamp,amount,transaction_status\n" +
    "TXN1,2024-01-01 10:00:00,500,SUCCESS\n";

  const input = screen.getByTestId("dataset-file-input");

  fireEvent.change(input, {
    target: { files: [new File([csv], "transactions.csv", { type: "text/csv" })] },
  });

  fireEvent.click(screen.getByRole("button", { name: /Analyse Dataset/i }));
}

const user = { name: "Test User", role: "Regular User" };

const MemoryRouter = ({ children }) => <div>{children}</div>;

test("Bank Pair Analysis page renders live data", async () => {
  mockFetchOnce(bankPairPayload);

  render(
    <MemoryRouter>
      <AuthProvider>
        <BankPairAnalysisPage user={user} />
      </AuthProvider>
    </MemoryRouter>
  );

  await screen.findByText("64");

  expect(screen.getAllByText("Bank Pair Analysis").length).toBeGreaterThan(0);
  expect(screen.getByText("Total Bank Pairs")).toBeInTheDocument();
  expect(screen.getByText("Failed Transactions")).toBeInTheDocument();
  expect(screen.getByText("Highest failure rate")).toBeInTheDocument();
  expect(screen.getByText("Lowest failure rate")).toBeInTheDocument();
  expect(screen.getByText("Most failures")).toBeInTheDocument();
  expect(screen.getAllByText("6.08%").length).toBeGreaterThan(0);

  // Table headers (label and sort arrow share one <span>)
  expect(screen.getByText(/^Sender Bank/)).toBeInTheDocument();
  expect(screen.getByText(/^Receiver Bank/)).toBeInTheDocument();
  expect(
    screen.getAllByText(/^Failure Rate/).length
  ).toBeGreaterThan(0);
});

test("Bank Pair Analysis page sorts on header click", async () => {
  mockFetchOnce(bankPairPayload);

  render(
    <MemoryRouter>
      <AuthProvider>
        <BankPairAnalysisPage user={user} />
      </AuthProvider>
    </MemoryRouter>
  );

  await screen.findByText("64");

  const headers = screen.getAllByText(/^Transactions/);
  fireEvent.click(headers[0]);

  // A new request must be issued with the new sort parameters
  const lastCall = global.fetch.mock.calls[
    global.fetch.mock.calls.length - 1
  ][0];

  expect(lastCall).toContain("sortBy=totalTransactions");
  expect(lastCall).toContain("sortOrder=desc");
});

test("Anomaly Detection page renders and explains", async () => {
  mockFetchOnce(anomalyPayload);

  render(
    <MemoryRouter>
      <AuthProvider>
        <AnomalyDetectionPage user={user} />
      </AuthProvider>
    </MemoryRouter>
  );

  await screen.findAllByText("TXN0000000153");

  expect(screen.getAllByText("Transaction Anomaly Detection").length).toBeGreaterThan(0);
  expect(screen.getByText("Total Transactions Analysed")).toBeInTheDocument();
  expect(screen.getByText("Anomaly Percentage")).toBeInTheDocument();
  // The rate must state its denominator so it can be checked
  expect(
    screen.getByText(/Of 12,471 filtered transactions/)
  ).toBeInTheDocument();
  expect(screen.getByText("Why was this transaction flagged?")).toBeInTheDocument();

  // The explanation must surface the measured reasons
  expect(
    screen.getByText(
      /Amount Rs 16 is below the 1st percentile/
    )
  ).toBeInTheDocument();

  expect(
    screen.getByText(/did not succeed, while 95.0%/)
  ).toBeInTheDocument();

  // The percentile sentence must use the real analysed-row count
  // (toLocaleString grouping is locale-dependent, so digits only)
  const scoreBlock = screen.getAllByTestId("explain-score")[0];
  expect(scoreBlock).toHaveTextContent(
    /2[\d,]*5[\d,]*0[\d,]*0[\d,]*0 analysed transactions/
  );
  // 99.23 score => more unusual than the lowest ~0.77% of the dataset
  expect(scoreBlock).toHaveTextContent(/about 0\.77%/);

  // Wording must not claim fraud
  expect(screen.queryByText(/fraud detected/i)).toBeNull();
  expect(screen.getAllByText(/Potential anomaly/).length).toBeGreaterThan(0);
});

test("Anomaly Detection page sends filters to the API", async () => {
  mockFetchOnce(anomalyPayload);

  render(
    <MemoryRouter>
      <AuthProvider>
        <AnomalyDetectionPage user={user} />
      </AuthProvider>
    </MemoryRouter>
  );

  await waitFor(() =>
    expect(
      screen.getAllByText("TXN0000000153").length
    ).toBeGreaterThan(0)
  );

  // DOM order: sender, receiver, network, device, type, status, page size
  const selects = screen.getAllByRole("combobox");
  fireEvent.change(selects[2], {
    target: { value: "WiFi" },
  });

  await waitFor(() => {
    const lastCall = global.fetch.mock.calls[
      global.fetch.mock.calls.length - 1
    ][0];

    expect(lastCall).toContain("networkType=WiFi");
  });
});

test("Dataset Analyzer page reports what it found in the uploaded file", async () => {
  await uploadAndAnalyse(datasetPayload);

  await screen.findByText("Outcome distribution");

  // The measured KPIs must be shown, not just the row count
  expect(screen.getByText("Transactions Analysed")).toBeInTheDocument();
  expect(screen.getByText("Failure Rate")).toBeInTheDocument();
  expect(screen.getByText("5.08%")).toBeInTheDocument();
  expect(screen.getByText("01 Jan 2024 to 30 Dec 2024")).toBeInTheDocument();

  // How the outcome column was read must be stated explicitly
  expect(screen.getByText(/Treated as failures:/)).toBeInTheDocument();
  expect(screen.getAllByText("FAILED").length).toBeGreaterThan(0);
  expect(screen.getAllByText("SUCCESS").length).toBeGreaterThan(0);

  // Insights carry the measured comparison
  expect(screen.getByText("3G fails noticeably more often")).toBeInTheDocument();
  expect(screen.getByText(/6.12% of the time against a 5.08% baseline/)).toBeInTheDocument();

  // A rate bar must show its denominator so the number can be checked
  expect(screen.getByText(/651 failed of/)).toBeInTheDocument();

  // Columns detected, with the role each one was read as
  expect(screen.getByText("Columns Detected")).toBeInTheDocument();
  expect(screen.getByText("Outcome")).toBeInTheDocument();
  expect(screen.getByText("Amount")).toBeInTheDocument();
  expect(screen.getByText("Identifier")).toBeInTheDocument();

  // What the file cannot support is named rather than silently dropped
  expect(screen.getByText("Not Available For This File")).toBeInTheDocument();
  expect(screen.getByText("Grouping by free-text columns")).toBeInTheDocument();

  // The file must be sent as base64 inside the JSON body
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toContain("/api/dataset/analyze");
  expect(JSON.parse(options.body).fileName).toBe("transactions.csv");
});

test("Dataset Analyzer page says when a file has no outcome column", async () => {
  await uploadAndAnalyse(datasetWithoutOutcome);

  await screen.findByText("No outcome column was found");

  // No failure rate may be shown anywhere, since none can be measured
  expect(screen.queryByText("Failure Rate")).toBeNull();
  expect(
    screen.getByText(/No column in this file was read as a transaction outcome/)
  ).toBeInTheDocument();

  // The gap is explained rather than left blank
  expect(screen.getByText("Failure rate and failure drivers")).toBeInTheDocument();
  expect(
    screen.getByText("No column of transaction outcomes was found.")
  ).toBeInTheDocument();

  // No chart should be drawn from a file with no outcome to break down
  expect(screen.queryByText("Outcome distribution")).toBeNull();
});

test("Dataset Analyzer page refuses a file type it cannot read", async () => {
  mockFetchOnce(datasetPayload);

  render(
    <MemoryRouter>
      <AuthProvider>
        <DatasetAnalyzerPage user={user} />
      </AuthProvider>
    </MemoryRouter>
  );

  fireEvent.change(screen.getByTestId("dataset-file-input"), {
    target: { files: [new File(["MZ"], "payload.exe", { type: "application/octet-stream" })] },
  });

  expect(
    screen.getByText(/Choose a CSV, .xlsx or .xls file/)
  ).toBeInTheDocument();

  // Nothing may be uploaded, and no Analyse button may appear
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /Analyse Dataset/i })).toBeNull();
});

test("Dataset Analyzer page surfaces an API error instead of failing silently", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: "The file could not be parsed as a table." }),
    })
  );

  render(
    <MemoryRouter>
      <AuthProvider>
        <DatasetAnalyzerPage user={user} />
      </AuthProvider>
    </MemoryRouter>
  );

  fireEvent.change(screen.getByTestId("dataset-file-input"), {
    target: { files: [new File(["a,b\n1,2\n"], "bad.csv", { type: "text/csv" })] },
  });

  fireEvent.click(screen.getByRole("button", { name: /Analyse Dataset/i }));

  await screen.findByText("The file could not be parsed as a table.");

  // No result may be shown when the request failed
  expect(screen.queryByText("Columns Detected")).toBeNull();
});