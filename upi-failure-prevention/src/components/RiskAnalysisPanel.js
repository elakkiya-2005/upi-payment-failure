// Renders the measured history behind a risk check:
//
//   KNN          what happened to the nearest historical transactions
//   Root cause   which measured group fails more often than baseline
//   Advice       the change the data supports, or an honest "none"
//   Anomaly      where the transaction sits on the Isolation Forest scale
//
// Every number shown here comes from the API. When the dataset cannot
// support a conclusion the panel says so instead of filling the space.

import {
  Brain,
  AlertTriangle,
  Lightbulb,
  Users,
  TrendingUp,
  Info,
} from "lucide-react";

const panelStyle = {
  marginTop: 20,
  background: "var(--bg)",
  boxShadow: "none",
  border: "1px solid var(--border)",
};

const rowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
};

const sectionTitle = {
  marginBottom: 12,
  fontSize: "0.95rem",
};

const severityColor = {
  HIGH: "var(--danger)",
  MEDIUM: "var(--warning)",
  LOW: "var(--text-muted, #64748b)",
};

const Panel = ({ icon: Icon, iconColor, title, badge, children }) => (
  <div className="card" style={panelStyle}>
    <h4
      className="flex items-center gap-sm"
      style={sectionTitle}
    >
      <Icon size={18} color={iconColor} />
      {title}
      {badge && (
        <span
          className="badge badge-neutral"
          style={{ marginLeft: "auto" }}
        >
          {badge}
        </span>
      )}
    </h4>
    {children}
  </div>
);


// -------------------------------------------
// KNN
// -------------------------------------------

function KnnPanel({ knn }) {
  if (!knn) return null;

  return (
    <Panel
      icon={Users}
      iconColor="var(--primary)"
      title="Similar Historical Transactions"
      badge={`${knn.neighborCount} neighbours`}
    >
      <div
        style={{
          display: "grid",
          gap: 10,
        }}
      >
        <div style={rowStyle}>
          <span>Failed out of neighbours</span>
          <strong>
            {knn.failedCount} of {knn.neighborCount}
          </strong>
        </div>

        <div style={rowStyle}>
          <span>Measured failure rate</span>
          <strong>{knn.failureRatePercent}%</strong>
        </div>

        <div style={rowStyle}>
          <span>
            Dataset baseline
            <small
              style={{
                display: "block",
                color: "var(--text-muted, #64748b)",
                fontWeight: 400,
              }}
            >
              {knn.baselineFailureRatePercent}% across the full history
            </small>
          </span>
          <strong>
            {knn.lift === null ? "—" : `${knn.lift}x`}
            <span
              style={{
                marginLeft: 8,
                fontSize: "0.72rem",
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 20,
                color:
                  knn.confidence === "HIGH"
                    ? "var(--danger)"
                    : knn.confidence === "MEDIUM"
                    ? "var(--warning)"
                    : "var(--success)",
                border: "1px solid currentColor",
              }}
            >
              {knn.confidence}
            </span>
          </strong>
        </div>
      </div>

      {knn.unknownFeatures?.length > 0 && (
        <div
          className="alert"
          style={{
            marginTop: 12,
            background: "var(--warning-light, #fffbeb)",
            borderColor: "var(--warning)",
            color: "var(--text)",
          }}
        >
          <AlertTriangle size={18} color="var(--warning)" />
          <div>
            <div className="alert-title">Values not in the dataset</div>
            <p style={{ margin: 0 }}>
              {knn.unknownFeatures.join(", ")} — the models have never seen
              these, so they contributed nothing to this comparison.
            </p>
          </div>
        </div>
      )}

      {knn.similarTransactions?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: "var(--text-muted, #64748b)",
              marginBottom: 8,
            }}
          >
            Closest matches from the dataset
          </div>

          <div
            style={{
              display: "grid",
              gap: 6,
            }}
          >
            {knn.similarTransactions.map((transaction) => (
              <div
                key={transaction.transactionId}
                style={{
                  ...rowStyle,
                  padding: "7px 10px",
                  fontSize: "0.8rem",
                }}
              >
                <span style={{ fontFamily: "monospace" }}>
                  {transaction.transactionId}
                </span>
                <span
                  style={{
                    color: "var(--text-muted, #64748b)",
                    fontSize: "0.75rem",
                  }}
                >
                  ₹{transaction.amount} · {transaction.networkType} ·{" "}
                  {transaction.hourOfDay}:00
                </span>
                <span
                  className={`badge badge-${
                    transaction.status === "FAILED" ? "fail" : "ok"
                  }`}
                >
                  {transaction.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}


// -------------------------------------------
// ROOT CAUSE
// -------------------------------------------

function RootCausePanel({ rootCause }) {
  if (!rootCause) return null;

  return (
    <Panel
      icon={TrendingUp}
      iconColor="var(--warning)"
      title="Failure Root Cause"
      badge={
        rootCause.evaluated
          ? rootCause.significant
            ? "Elevated"
            : "Within baseline"
          : "Not comparable"
      }
    >
      <p
        style={{
          margin: "0 0 12px",
          fontSize: "0.85rem",
          color: "var(--text-muted, #64748b)",
        }}
      >
        Measured across {rootCause.datasetRows.toLocaleString("en-IN")}{" "}
        historical transactions. A group is only reported as a cause when
        it fails at least {rootCause.minUsefulLift}x the{" "}
        {rootCause.baselineFailureRatePercent}% baseline on a large enough
        sample.
      </p>

      {!rootCause.evaluated && (
        <div
          className="alert"
          style={{
            background: "var(--warning-light, #fffbeb)",
            borderColor: "var(--warning)",
            color: "var(--text)",
          }}
        >
          <AlertTriangle size={18} color="var(--warning)" />
          <div>
            <div className="alert-title">
              These values are not in the dataset
            </div>
            <ul
              style={{
                margin: "4px 0 0",
                paddingLeft: 18,
              }}
            >
              {rootCause.missingValues.map((missing, index) => (
                <li key={index}>
                  {missing.dimension} = &ldquo;{missing.value}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {rootCause.evaluated && rootCause.causes.length === 0 && (
        <div
          style={{
            ...rowStyle,
            borderColor: "var(--success)",
            color: "var(--success)",
          }}
        >
          <span>
            No factor measured above the{" "}
            {rootCause.baselineFailureRatePercent}% baseline.
          </span>
        </div>
      )}

      {rootCause.causes.map((cause, index) => (
        <div
          key={index}
          style={{
            ...rowStyle,
            marginTop: index > 0 ? 8 : 0,
            borderLeft: `4px solid ${severityColor[cause.severity]}`,
            alignItems: "flex-start",
          }}
        >
          <div>
            <strong style={{ display: "block" }}>
              {cause.dimensionLabel} = {cause.value}
            </strong>
            <small
              style={{
                color: "var(--text-muted, #64748b)",
                display: "block",
                marginTop: 2,
              }}
            >
              {cause.failureRatePercent}% failed ·{" "}
              {cause.sampleSize.toLocaleString("en-IN")} transactions
            </small>
          </div>
          <span
            style={{
              fontWeight: 700,
              color: severityColor[cause.severity],
              whiteSpace: "nowrap",
            }}
          >
            {cause.lift}x
          </span>
        </div>
      ))}

      {rootCause.evaluated &&
        rootCause.causes.length > 0 &&
        rootCause.causes.some((c) => c.kind === "INTERACTION") && (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: "0.78rem",
              color: "var(--text-muted, #64748b)",
            }}
          >
            <Info size={12} style={{ verticalAlign: "-2px" }} />{" "}
            Effects measured on a combination are not visible in the
            individual fields on their own.
          </p>
        )}
    </Panel>
  );
}


// -------------------------------------------
// RECOMMENDATION
// -------------------------------------------

function RecommendationPanel({ measured, fallback }) {
  if (!measured && !fallback) return null;

  const actions = measured?.actions || [];

  return (
    <Panel
      icon={Lightbulb}
      iconColor="var(--success)"
      title="Recommended Action"
      badge={measured?.dataDriven ? "Measured" : "Rule based"}
    >
      <strong style={{ display: "block", marginBottom: 6 }}>
        {measured?.title || fallback?.title}
      </strong>

      <p
        style={{
          margin: 0,
          fontSize: "0.87rem",
        }}
      >
        {measured?.summary || fallback?.message}
      </p>

      {measured?.advice && (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: "0.87rem",
            color: "var(--text-muted, #64748b)",
          }}
        >
          {measured.advice}
        </p>
      )}

      {actions.length > 0 && (
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gap: 8,
          }}
        >
          {actions.map((action, index) => (
            <div
              key={index}
              style={{
                ...rowStyle,
                borderColor: "var(--success)",
                alignItems: "flex-start",
              }}
            >
              <div>
                <strong style={{ display: "block" }}>
                  {action.action}
                </strong>
                <small
                  style={{
                    color: "var(--text-muted, #64748b)",
                    display: "block",
                    marginTop: 2,
                  }}
                >
                  {action.reason}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}

      {actions.length === 0 &&
        measured?.rejectedAlternatives?.length > 0 && (
          <details
            style={{
              marginTop: 12,
              fontSize: "0.8rem",
              color: "var(--text-muted, #64748b)",
            }}
          >
            <summary style={{ cursor: "pointer" }}>
              Alternatives considered and rejected
            </summary>
            <ul
              style={{
                margin: "8px 0 0",
                paddingLeft: 18,
              }}
            >
              {measured.rejectedAlternatives.map((alternative, index) => (
                <li key={index}>
                  {alternative.value} (
                  {alternative.currentFailureRatePercent}% →{" "}
                  {alternative.failureRatePercent}%, only{" "}
                  {Math.round(alternative.relativeImprovement * 100)}%
                  better — below the threshold)
                </li>
              ))}
            </ul>
          </details>
        )}
    </Panel>
  );
}


// -------------------------------------------
// ANOMALY
// -------------------------------------------

function AnomalyPanel({ anomaly }) {
  if (!anomaly) return null;

  if (!anomaly.available) {
    return (
      <Panel
        icon={Brain}
        iconColor="var(--text-muted, #64748b)"
        title="Anomaly Detection"
      >
        <p style={{ margin: 0, fontSize: "0.85rem" }}>
          {anomaly.reason}
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      icon={Brain}
      iconColor={
        anomaly.isAnomaly ? "var(--danger)" : "var(--success)"
      }
      title="Isolation Forest Anomaly Score"
      badge={anomaly.status}
    >
      <div style={rowStyle}>
        <span>Unusualness (higher = rarer)</span>
        <strong>
          {anomaly.anomalyScore}
          <span
            style={{
              fontWeight: 400,
              color: "var(--text-muted, #64748b)",
            }}
          >
            {" "}
            /100
          </span>
        </strong>
      </div>

      <div
        style={{
          height: 8,
          borderRadius: 20,
          background: "var(--border)",
          marginTop: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(Math.max(anomaly.anomalyScore, 0), 100)}%`,
            height: "100%",
            background: anomaly.isAnomaly
              ? "var(--danger)"
              : "var(--success)",
          }}
        />
      </div>

      {anomaly.reasons.length > 0 && (
        <ul
          style={{
            margin: "12px 0 0",
            paddingLeft: 18,
            fontSize: "0.82rem",
            display: "grid",
            gap: 5,
          }}
        >
          {anomaly.reasons.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
      )}

      <p
        style={{
          margin: "10px 0 0",
          fontSize: "0.72rem",
          color: "var(--text-muted, #64748b)",
        }}
      >
        Scored against {anomaly.referenceSize?.toLocaleString("en-IN")}{" "}
        historical transactions. This measures how unusual the
        combination is, not whether it is fraudulent.
        {anomaly.substitutedStatus && (
          <>
            {" "}The status column was filled with{" "}
            &ldquo;{anomaly.substitutedStatus}&rdquo;, taken from the
            majority of the nearest neighbours, because a planned
            transaction has no outcome yet.
          </>
        )}
      </p>
    </Panel>
  );
}


// -------------------------------------------
// EXPORTED
// -------------------------------------------

export default function RiskAnalysisPanel({ result }) {
  const { response } = result;
  if (response.historyError) {
    return (
      <div
        className="card"
        style={panelStyle}
      >
        <h4 className="flex items-center gap-sm">
          <AlertTriangle
            size={18}
            color="var(--warning)"
          />
          Historical analysis unavailable
        </h4>
        <p
          style={{
            margin: 0,
            fontSize: "0.87rem",
          }}
        >
          {response.historyError} The Random Forest result above is still
          valid.
        </p>
      </div>
    );
  }

  return (
    <>
      <KnnPanel knn={response.knn} />

      <RootCausePanel rootCause={response.rootCause} />

      <RecommendationPanel
        measured={response.measuredRecommendation}
        fallback={response.recommendation}
      />

      <AnomalyPanel anomaly={response.anomaly} />
    </>
  );
}
