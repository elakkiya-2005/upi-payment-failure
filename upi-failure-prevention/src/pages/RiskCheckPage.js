import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Gauge,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  Brain,
  History,
  FileDown,
  Printer,
} from "lucide-react";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Button from "../components/Button";
import RiskAnalysisPanel from "../components/RiskAnalysisPanel";
import { TextInput, SelectInput } from "../components/FormInputs";

import {
  fetchRiskOptions,
  checkRisk,
  optionValues,
} from "../utils/riskApi";
import { exportRiskCsv, exportRiskReport } from "../utils/riskReport";
import { formatCurrency } from "../utils/format";


const initialForm = {
  amount: "",
  time: "",
  paymentApp: "",
  bank: "",
  deviceType: "",
  networkType: "",
  transactionType: "",
};

// The payment app is not a column in upi_transactions, so there is no
// dataset list to read. It only ever travels to the API as a label.
const PAYMENT_APPS = [
  "Google Pay",
  "PhonePe",
  "Paytm",
  "Amazon Pay",
  "BHIM UPI",
];

const levelColor = {
  low: "var(--success)",
  medium: "var(--warning)",
  high: "var(--danger)",
  unavailable: "var(--text-muted, #64748b)",
  "not comparable": "var(--text-muted, #64748b)",
};

const levelKeyOf = (level) => String(level || "").toLowerCase();

// Maps a dataset option group to the form field it fills.
const OPTION_NAMES = {
  banks: "bank",
  networkTypes: "networkType",
  deviceTypes: "deviceType",
  transactionTypes: "transactionType",
};


export default function RiskCheckPage({ user }) {

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [savedToHistory, setSavedToHistory] = useState(false);

  // Dropdown values, loaded from upi_transactions.
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState(null);
  const [optionsLoading, setOptionsLoading] = useState(true);


  // ==========================================
  // LOAD THE DATASET OPTIONS
  // ==========================================

  useEffect(() => {

    let cancelled = false;

    fetchRiskOptions()
      .then((data) => {

        if (cancelled) return;

        setOptions(data);
        setOptionsError(null);

      })
      .catch((error) => {

        if (cancelled) return;

        setOptionsError(error.message);

      })
      .finally(() => {

        if (!cancelled) setOptionsLoading(false);

      });

    return () => {
      cancelled = true;
    };

  }, []);


  // ==========================================
  // HANDLE FORM CHANGE
  // ==========================================

  const onChange = (e) => {

    setForm((f) => ({
      ...f,
      [e.target.name]: e.target.value,
    }));

    setErrors((er) => ({
      ...er,
      [e.target.name]: undefined,
    }));

  };


  // ==========================================
  // VALIDATE FORM
  // ==========================================

  const validate = () => {

    const e = {};
    const amount = Number(form.amount);

    if (!form.amount) {
      e.amount = "Amount is required";
    } else if (isNaN(amount) || amount <= 0) {
      e.amount = "Enter a valid amount";
    } else if (amount > 500000) {
      e.amount = "Amount seems too high (max ₹5,00,000)";
    }

    if (!form.time) {
      e.time = "Select a transaction time";
    }

    if (!form.paymentApp) {
      e.paymentApp = "Select a payment app";
    }

    if (!form.bank) {
      e.bank = "Select your bank";
    }

    if (!form.deviceType) {
      e.deviceType = "Select a device type";
    }

    if (!form.networkType) {
      e.networkType = "Select a network type";
    }

    if (!form.transactionType) {
      e.transactionType = "Select a transaction type";
    }

    return e;

  };


  // ==========================================
  // CALL BACKEND RISK API
  // ==========================================

  const handleAnalyze = async (ev) => {

    ev.preventDefault();

    const e = validate();
    setErrors(e);

    if (Object.keys(e).length > 0) {
      return;
    }

    setLoading(true);
    setResult(null);
    setSavedToHistory(false);

    try {

      const data = await checkRisk({
        amount: Number(form.amount),
        time: form.time,
        paymentApp: form.paymentApp,
        bank: form.bank,
        deviceType: form.deviceType,
        networkType: form.networkType,
        transactionType: form.transactionType,
      });


      setResult({
        response: data,
        form: {
          amount: Number(form.amount),
          time: form.time,
          paymentApp: form.paymentApp,
          bank: form.bank,
          deviceType: form.deviceType,
          networkType: form.networkType,
          transactionType: form.transactionType,
        },
      });


      if (data.savedToHistory) {
        setSavedToHistory(true);
      }

    } catch (error) {

      console.error("Risk API Error:", error);

      setErrors({
        form: error.message,
      });

    } finally {

      setLoading(false);

    }

  };


  // ==========================================
  // RESET FORM
  // ==========================================

  const reset = () => {

    setForm(initialForm);
    setErrors({});
    setResult(null);
    setSavedToHistory(false);

  };


  const onExportCsv = () => {

    try {
      exportRiskCsv(result);
    } catch (error) {
      setErrors((er) => ({ ...er, export: error.message }));
    }

  };


  const onExportPdf = () => {

    try {
      exportRiskReport(result);
    } catch (error) {
      setErrors((er) => ({ ...er, export: error.message }));
    }

  };


  // A select bound to a dataset dimension. Values come from the API so
  // the models always receive a category they were trained on.
  const datasetSelect = (key) => (
    <SelectInput
      label={options?.[key]?.label || key}
      name={OPTION_NAMES[key]}
      value={form[OPTION_NAMES[key]]}
      onChange={onChange}
      error={errors[OPTION_NAMES[key]]}
      disabled={optionsLoading || !options}
    >
      <option value="">
        {optionsLoading ? "Loading dataset values..." : "Select"}
      </option>

      {optionValues(options, key).map((value) => (
        <option
          key={value}
          value={value}
        >
          {value}
        </option>
      ))}
    </SelectInput>
  );


  const response = result?.response;
  const levelKey = levelKeyOf(response?.riskLevel);
  const notComparable = levelKey === "not comparable";


  return (
    <DashboardLayout
      user={user}
      title="Check Transaction Risk"
    >
      <PageHeader
        subtitle="Every figure below is measured against the historical transaction dataset, not estimated from fixed rules."
      />


      {optionsError && (
        <div
          className="alert"
          style={{
            marginBottom: 16,
            background: "var(--danger-light, #fef2f2)",
            borderColor: "var(--danger)",
            color: "var(--text)",
          }}
        >
          <AlertTriangle size={18} color="var(--danger)" />
          <div>
            <div className="alert-title">
              Transaction options unavailable
            </div>
            <p style={{ margin: 0 }}>
              {optionsError} The risk check needs the dataset values to
              analyse a transaction accurately.
            </p>
          </div>
        </div>
      )}


      <div className="grid-two">


        {/* ================================= */}
        {/* TRANSACTION FORM */}
        {/* ================================= */}

        <Card
          title="Transaction Details"
          icon={Wallet}
        >

          <form
            onSubmit={handleAnalyze}
            noValidate
          >

            <div className="form-row">
              <TextInput
                label="Transaction Amount (₹)"
                name="amount"
                type="number"
                placeholder="e.g. 4500"
                value={form.amount}
                onChange={onChange}
                error={errors.amount}
              />

              <TextInput
                label="Transaction Time"
                name="time"
                type="time"
                value={form.time}
                onChange={onChange}
                error={errors.time}
              />
            </div>

            {errors.form && (
              <div
                className="alert"
                style={{
                  marginBottom: 14,
                  background: "var(--danger-light, #fef2f2)",
                  borderColor: "var(--danger)",
                  color: "var(--text)",
                }}
              >
                <AlertTriangle size={18} color="var(--danger)" />
                <p style={{ margin: 0 }}>{errors.form}</p>
              </div>
            )}

            <div className="form-row">
              <SelectInput
                label="Payment App"
                name="paymentApp"
                value={form.paymentApp}
                onChange={onChange}
                error={errors.paymentApp}
              >
                <option value="">
                  Select app
                </option>

                {PAYMENT_APPS.map((app) => (
                  <option
                    key={app}
                    value={app}
                  >
                    {app}
                  </option>
                ))}
              </SelectInput>

              {datasetSelect("banks")}
            </div>

            <div className="form-row">
              {datasetSelect("deviceTypes")}
              {datasetSelect("networkTypes")}
            </div>

            {datasetSelect("transactionTypes")}

            <Button
              type="submit"
              size="block"
              loading={loading}
              disabled={optionsLoading || Boolean(optionsError)}
            >
              {loading
                ? "Analyzing..."
                : "Analyze Failure Risk"}
            </Button>

          </form>

        </Card>


        {/* ================================= */}
        {/* LOADING */}
        {/* ================================= */}

        {loading && (
          <Card>
            <div
              className="loading-state"
              style={{ minHeight: 300 }}
            >
              <div className="spinner" />

              <p>
                Comparing against {options?.datasetRows?.toLocaleString("en-IN") || "the"} historical
                transactions and scoring the anomaly...
              </p>
            </div>
          </Card>
        )}


        {/* ================================= */}
        {/* EMPTY RESULT */}
        {/* ================================= */}

        {!loading && !result && (
          <Card>
            <div
              className="empty-state"
              style={{ minHeight: 300 }}
            >
              <Gauge size={52} />

              <h3>Your risk result will appear here</h3>

              <p>
                Pick values from the dropdowns, which are loaded from the
                transaction dataset itself, then press Analyze Failure Risk.
              </p>
            </div>
          </Card>
        )}


        {/* ================================= */}
        {/* RESULT */}
        {/* ================================= */}

        {!loading && result && response && (
          <Card>


            {/* SAVED TO HISTORY */}

            {savedToHistory && (
              <div
                className="flex items-center gap-sm"
                style={{
                  marginBottom: 20,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--success-light, #ecfdf5)",
                  border: "1px solid var(--success)",
                  color: "var(--success)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                }}
              >
                <History size={16} />
                Risk assessment saved to your history.

                <Link
                  to="/my-risk-history"
                  style={{
                    marginLeft: "auto",
                    color: "var(--success)",
                    textDecoration: "underline",
                    fontWeight: 700,
                  }}
                >
                  View
                </Link>
              </div>
            )}


            {/* MEASURED RISK GAUGE */}

            {notComparable ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "20px 0",
                }}
              >
                <AlertTriangle
                  size={44}
                  color="var(--warning)"
                />
                <h3 style={{ marginTop: 10 }}>
                  Not comparable
                </h3>
                <p
                  style={{
                    color: "var(--text-muted, #64748b)",
                    fontSize: "0.88rem",
                    maxWidth: 420,
                    margin: "6px auto 0",
                  }}
                >
                  One or more selected values do not exist in the
                  transaction dataset, so no failure rate can be measured
                  for this combination.
                </p>
              </div>
            ) : (
              <div className="risk-gauge">
                <div
                  className="gauge-ring"
                  style={{
                    "--score": response.riskScore ?? 0,
                    "--gauge-color": levelColor[levelKey],
                  }}
                >
                  <div className="gauge-value">
                    {response.riskScore ?? "—"}
                    <span>/100</span>
                  </div>
                </div>

                <span className={`risk-level ${levelKey}`}>
                  {response.riskScore === null
                    ? response.riskLevel
                    : `${response.riskLevel} RISK`}
                </span>

                {response.rootCause && (
                  <small
                    style={{
                      display: "block",
                      marginTop: 6,
                      color: "var(--text-muted, #64748b)",
                    }}
                  >
                    measured failure rate of the{" "}
                    {response.knn?.neighborCount ?? 0} closest historical
                    transactions
                  </small>
                )}
              </div>
            )}


            {/* TRANSACTION SUMMARY */}

            <div
              className="flex wrap gap-sm mt-16"
              style={{ justifyContent: "center" }}
            >
              <span className="chip">
                {formatCurrency(result.form.amount)}
              </span>
              <span className="chip">
                {result.form.paymentApp}
              </span>
              <span className="chip">{result.form.bank}</span>
              <span className="chip">
                {result.form.deviceType}
              </span>
              <span className="chip">
                {result.form.networkType}
              </span>
              <span className="chip">
                {result.form.transactionType}
              </span>
            </div>


            {/* RANDOM FOREST (fraud) */}

            {response.mlFraudRiskLevel && (
              <div
                className="card"
                style={{
                  marginTop: 20,
                  background: "var(--bg)",
                  boxShadow: "none",
                  border: "1px solid var(--border)",
                }}
              >
                <h4
                  className="flex items-center gap-sm"
                  style={{ marginBottom: 14 }}
                >
                  <Brain
                    size={20}
                    color="var(--primary)"
                  />
                  Random Forest Fraud Prediction
                </h4>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span>Fraud Prediction</span>
                    <strong>
                      {response.mlPrediction === 1
                        ? "Fraud Detected"
                        : "No Fraud Detected"}
                    </strong>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span>Fraud Probability</span>
                    <strong>
                      {response.mlFraudProbability}%
                    </strong>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span>Fraud Risk Level</span>
                    <strong>
                      {response.mlFraudRiskLevel}
                    </strong>
                  </div>
                </div>
              </div>
            )}


            {/* MEASURED HISTORY PANELS */}

            <RiskAnalysisPanel result={result} />


            {/* EXPORT */}

            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                className="flex items-center gap-sm"
                style={{ marginBottom: 10 }}
              >
                <FileDown
                  size={16}
                  color="var(--primary)"
                />
                <strong style={{ fontSize: "0.9rem" }}>
                  Export this report
                </strong>
              </div>

              <div
                className="flex wrap gap-sm"
              >
                <Button
                  variant="outline"
                  icon={FileDown}
                  onClick={onExportCsv}
                >
                  Download CSV
                </Button>

                <Button
                  variant="outline"
                  icon={Printer}
                  onClick={onExportPdf}
                >
                  Print / Save PDF
                </Button>
              </div>

              {errors.export && (
                <p
                  style={{
                    margin: "8px 0 0",
                    color: "var(--danger)",
                    fontSize: "0.82rem",
                  }}
                >
                  {errors.export}
                </p>
              )}
            </div>


            <Button
              variant="outline"
              size="block"
              className="mt-16"
              icon={CheckCircle2}
              onClick={reset}
            >
              Check Another Transaction
            </Button>

          </Card>
        )}

      </div>

    </DashboardLayout>

  );

}
