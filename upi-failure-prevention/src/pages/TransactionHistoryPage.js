import { useState, useMemo, useEffect } from "react";
import { Search, Filter, History } from "lucide-react";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import StatusBadge, { RiskBadge } from "../components/StatusBadge";
import Pagination from "../components/Pagination";
import { EmptyState, LoadingState } from "../components/States";
import { TextInput, SelectInput } from "../components/FormInputs";
import { formatCurrency } from "../utils/format";

const PAGE_SIZE = 10;

export default function TransactionHistoryPage({ user }) {

  // Real transactions from MySQL API
  const [transactions, setTransactions] = useState([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  const [network, setNetwork] = useState("");
  const [risk, setRisk] = useState("");
  const [page, setPage] = useState(1);


  // FETCH REAL DATA FROM BACKEND
  useEffect(() => {

    const fetchTransactions = async () => {

      try {

        const response = await fetch(
          "http://localhost:5000/api/transactions"
        );

        const data = await response.json();

        setTransactions(data);

      } catch (error) {

        console.error(
          "Transaction API Error:",
          error
        );

      } finally {

        setLoading(false);

      }

    };

    fetchTransactions();

  }, []);


  // GET UNIQUE NETWORK TYPES
  const networks = useMemo(
    () => [...new Set(transactions.map((t) => t.network_type))],
    [transactions]
  );


  // FILTER REAL MYSQL DATA
  const filtered = useMemo(() => {

    let list = transactions;


    // SEARCH TRANSACTION ID / BANK
    if (search.trim()) {

      const q = search.trim().toLowerCase();

      list = list.filter(
        (t) =>
          t.transaction_id
            ?.toLowerCase()
            .includes(q) ||

          t.sender_bank
            ?.toLowerCase()
            .includes(q) ||

          t.receiver_bank
            ?.toLowerCase()
            .includes(q)
      );

    }


    // STATUS FILTER
    if (status) {

      list = list.filter(
        (t) =>
          t.transaction_status?.toLowerCase() ===
          status
      );

    }


    // NETWORK FILTER
    if (network) {

      list = list.filter(
        (t) =>
          t.network_type === network
      );

    }


    // RISK FILTER
    if (risk) {

      list = list.filter((t) => {

        let transactionRisk = "low";


        if (t.fraud_flag === 1) {

          transactionRisk = "high";

        } else if (
          t.transaction_status === "FAILED"
        ) {

          transactionRisk = "medium";

        }


        return transactionRisk === risk;

      });

    }


    // DATE FILTER
    if (date) {

      list = list.filter((t) => {

        const transactionDate =
          new Date(t.timestamp)
            .toISOString()
            .slice(0, 10);

        return transactionDate === date;

      });

    }


    return list;

  }, [
    transactions,
    search,
    status,
    network,
    risk,
    date
  ]);


  // PAGINATION
  const totalPages = Math.ceil(
    filtered.length / PAGE_SIZE
  );

  const safePage = Math.min(
    page,
    totalPages || 1
  );

  const start =
    (safePage - 1) * PAGE_SIZE;

  const rows =
    filtered.slice(
      start,
      start + PAGE_SIZE
    );


  // RESET FILTERS
  const resetFilters = () => {

    setSearch("");
    setStatus("");
    setDate("");
    setNetwork("");
    setRisk("");
    setPage(1);

  };


  // LOADING SCREEN
  if (loading) {

    return (

      <DashboardLayout
        user={user}
        title="Transaction History"
      >

        <LoadingState label="Loading 250,000 transactions..." />

      </DashboardLayout>

    );

  }


  return (

    <DashboardLayout
      user={user}
      title="Transaction History"
    >

      <PageHeader

        subtitle={`${filtered.length.toLocaleString()} transactions match your current filters.`}

      />


      {/* FILTER BAR */}

      <div className="filter-bar">


        {/* SEARCH */}

        <div
          style={{
            position: "relative"
          }}
        >

          <Search

            size={16}

            style={{
              position: "absolute",
              left: 12,
              top: 12,
              color:
                "var(--text-muted)"
            }}

          />


          <input

            className="form-control"

            style={{
              paddingLeft: 34
            }}

            placeholder="Search by TXN ID or bank..."

            value={search}

            onChange={(e) => {

              setSearch(
                e.target.value
              );

              setPage(1);

            }}

          />

        </div>


        {/* STATUS */}

        <SelectInput

          value={status}

          onChange={(e) => {

            setStatus(
              e.target.value
            );

            setPage(1);

          }}

        >

          <option value="">
            All Statuses
          </option>

          <option value="success">
            Successful
          </option>

          <option value="failed">
            Failed
          </option>

        </SelectInput>


        {/* RISK */}

        <SelectInput

          value={risk}

          onChange={(e) => {

            setRisk(
              e.target.value
            );

            setPage(1);

          }}

        >

          <option value="">
            All Risk Levels
          </option>

          <option value="low">
            Low Risk
          </option>

          <option value="medium">
            Medium Risk
          </option>

          <option value="high">
            High Risk
          </option>

        </SelectInput>


        {/* NETWORK */}

        <SelectInput

          value={network}

          onChange={(e) => {

            setNetwork(
              e.target.value
            );

            setPage(1);

          }}

        >

          <option value="">
            All Networks
          </option>


          {networks.map((n) => (

            <option
              key={n}
              value={n}
            >

              {n}

            </option>

          ))}

        </SelectInput>


        {/* DATE */}

        <TextInput

          type="date"

          value={date}

          onChange={(e) => {

            setDate(
              e.target.value
            );

            setPage(1);

          }}

          placeholder="All Dates"

        />

      </div>


      {/* TRANSACTION TABLE */}

      <Card

        title="Real Transactions"

        icon={History}

        actions={

          <button

            className="btn btn-ghost"

            style={{
              fontSize:
                "0.82rem"
            }}

            onClick={
              resetFilters
            }

          >

            <Filter size={15} />

            Reset Filters

          </button>

        }

      >


        {rows.length === 0 ? (

          <EmptyState

            title="No transactions found"

            message="Try changing your search term or clearing the filters."

          />

        ) : (

          <div

            className="table-wrap"

            style={{
              border: "none",
              boxShadow: "none"
            }}

          >

            <table
              className="table"
            >

              <thead>

                <tr>

                  <th>
                    Transaction ID
                  </th>

                  <th>
                    Amount
                  </th>

                  <th>
                    Date & Time
                  </th>

                  <th>
                    Sender Bank
                  </th>

                  <th>
                    Network
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Risk Level
                  </th>

                </tr>

              </thead>


              <tbody>


                {rows.map((t) => {


                  let transactionRisk =
                    "low";


                  if (
                    t.fraud_flag === 1
                  ) {

                    transactionRisk =
                      "high";

                  }

                  else if (
                    t.transaction_status ===
                    "FAILED"
                  ) {

                    transactionRisk =
                      "medium";

                  }


                  return (

                    <tr
                      key={
                        t.transaction_id
                      }
                    >

                      <td
                        className="mono"
                      >

                        {
                          t.transaction_id
                        }

                      </td>


                      <td
                        style={{
                          fontWeight:
                            600
                        }}
                      >

                        {
                          formatCurrency(
                            t.amount
                          )
                        }

                      </td>


                      <td>

                        {
                          new Date(
                            t.timestamp
                          ).toLocaleString()
                        }

                      </td>


                      <td>

                        {
                          t.sender_bank
                        }

                      </td>


                      <td>

                        {
                          t.network_type
                        }

                      </td>


                      <td>

                        <StatusBadge

                          status={

                            t.transaction_status ===
                            "SUCCESS"

                              ? "success"

                              : "failed"

                          }

                        />

                      </td>


                      <td>

                        <RiskBadge

                          level={
                            transactionRisk
                          }

                        />

                      </td>

                    </tr>

                  );

                })}


              </tbody>

            </table>

          </div>

        )}


        <Pagination

          page={safePage}

          totalPages={
            totalPages
          }

          onChange={
            setPage
          }

        />


      </Card>


    </DashboardLayout>

  );

}