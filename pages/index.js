import { useState } from "react";
import { FOREMEN, FOUR_DAY_FOREMEN } from "../lib/jotform";

const FORM_LABELS = [
  "4@12 Daily Check-In",
  "Truck Pre & Post Trip",
  "Equipment Pre & Post Trip",
  "FLHA / Hazard Assessment",
  "Truck Inspection Checklist",
];

const MANUAL_FORMS = ["Daily Job Notes", "Daily Job Photos"];
const ALL_FORM_LABELS = [
  "4@12 Daily Check-In",
  "Truck Pre & Post Trip",
  "Equipment Pre & Post Trip",
  "FLHA / Hazard Assessment",
  "Truck Inspection Checklist",
  "Daily Job Notes",
  "Daily Job Photos",
];

function getMonday(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

function getWeekDates(mondayStr, isFourDay) {
  const days = [];
  const count = isFourDay ? 4 : 5;
  for (let i = 0; i < count; i++) {
    const d = new Date(mondayStr + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatWeekLabel(days) {
  const first = new Date(days[0] + "T12:00:00Z");
  const last = new Date(days[days.length - 1] + "T12:00:00Z");
  const opts = { month: "short", day: "numeric", timeZone: "UTC" };
  return `${first.toLocaleDateString("en-US", opts)} – ${last.toLocaleDateString("en-US", opts)}, ${first.getUTCFullYear()}`;
}

export default function Home() {
  const [foreman, setForeman] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [step, setStep] = useState("setup"); // setup | fetching | manual | generating | done
  const [fetchedData, setFetchedData] = useState(null);
  const [manualCounts, setManualCounts] = useState({});
  const [manualDaily, setManualDaily] = useState({});
  const [error, setError] = useState(null);

  const isFourDay = FOUR_DAY_FOREMEN.includes(foreman);
  const monday = weekStart ? getMonday(weekStart) : null;
  const weekDates = monday ? getWeekDates(monday, isFourDay) : [];
  const dayLabels = weekDates.map(formatDayLabel);
  const weekLabel = weekDates.length ? formatWeekLabel(weekDates) : "";

  async function handleFetch() {
    setError(null);
    setStep("fetching");
    try {
      const endDate = weekDates[weekDates.length - 1];
      const res = await fetch("/api/scorecard-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foreman, startDate: monday, endDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      setFetchedData(data);

      // Init manual counts for FLHA + extra forms
      const mc = {};
      const md = {};
      for (const label of ["Daily Job Notes", "Daily Job Photos"]) {
        mc[label] = "";
        md[label] = {};
        for (const d of weekDates) md[label][d] = false;
      }
      setManualCounts(mc);
      setManualDaily(md);
      setStep("manual");
    } catch (e) {
      setError(e.message);
      setStep("setup");
    }
  }

  async function handleGenerate() {
    setStep("generating");
    setError(null);
    try {
      // Build forms array (all forms including manual)
      const allForms = [];

      // Auto-fetched forms
      for (const label of FORM_LABELS) {
        const d = fetchedData.results[label];
        allForms.push({
          label,
          submitted: d.total,
          possible: d.possible,
          error: d.error || null,
        });
      }

      // Manual forms
      for (const label of ["Daily Job Notes", "Daily Job Photos"]) {
        const submitted = parseInt(manualCounts[label]) || 0;
        allForms.push({ label, submitted, possible: weekDates.length, error: null });
      }

      // Build daily breakdown (all forms)
      const dailyBreakdown = [];
      for (const label of FORM_LABELS) {
        const d = fetchedData.results[label];
        dailyBreakdown.push({
          label,
          days: weekDates.map(date => (d.dailyCounts[date] || 0) > 0),
        });
      }
      for (const label of ["Daily Job Notes", "Daily Job Photos"]) {
        dailyBreakdown.push({
          label,
          days: weekDates.map(date => manualDaily[label]?.[date] || false),
        });
      }

      // Build flags
      const flags = [];
      for (const { label, submitted, possible } of allForms) {
        const missing = [];
        // Find missing days for auto forms
        const idx = FORM_LABELS.indexOf(label);
        if (idx !== -1) {
          const d = fetchedData.results[label];
          weekDates.forEach((date, i) => {
            if ((d.dailyCounts[date] || 0) === 0) missing.push(dayLabels[i]);
          });
        } else {
          // manual
          const manLabel = label;
          weekDates.forEach((date, i) => {
            if (!manualDaily[manLabel]?.[date]) missing.push(dayLabels[i]);
          });
        }
        if (missing.length > 0 && missing.length < possible) {
          flags.push({ form: label, note: `Missing: ${missing.join(", ")}` });
        } else if (submitted === 0) {
          flags.push({ form: label, note: "No submissions this week." });
        }
      }

      const scheduleLabel = isFourDay ? "4-day Schedule (Mon – Thu)" : "5-day Schedule (Mon – Fri)";

      const res = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foreman,
          scheduleLabel,
          weekLabel,
          workingDays: weekDates.length,
          forms: allForms,
          dailyBreakdown,
          flags,
          dayLabels,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "PDF generation failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${foreman.replace(/ /g, "_")}_Scorecard.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setStep("done");
    } catch (e) {
      setError(e.message);
      setStep("manual");
    }
  }

  function resetForm() {
    setForeman("");
    setWeekStart("");
    setStep("setup");
    setFetchedData(null);
    setManualCounts({});
    setManualDaily({});
    setError(null);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f7f1", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#2D5016", padding: "20px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ color: "white", fontWeight: 800, fontSize: 22, letterSpacing: 1 }}>LYONS</div>
          <div style={{ color: "#a8c98a", fontSize: 10, letterSpacing: 2 }}>LANDSCAPING</div>
        </div>
        <div style={{ borderLeft: "1px solid #4a7c28", height: 36, marginLeft: 8 }} />
        <div style={{ color: "white", fontSize: 16, fontWeight: 600 }}>Foreman Scorecard Generator</div>
      </div>

      <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>

        {/* STEP 1: Setup */}
        {step === "setup" && (
          <div style={{ background: "white", borderRadius: 10, padding: 32, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h2 style={{ margin: "0 0 24px", color: "#2D5016", fontSize: 18 }}>Generate Scorecard</h2>

            <label style={labelStyle}>Foreman</label>
            <select value={foreman} onChange={e => setForeman(e.target.value)} style={selectStyle}>
              <option value="">— Select foreman —</option>
              {FOREMEN.map(f => <option key={f} value={f}>{f}</option>)}
            </select>

            <label style={{ ...labelStyle, marginTop: 20 }}>Week Starting (pick any day in the week)</label>
            <input
              type="date"
              value={weekStart}
              onChange={e => setWeekStart(e.target.value)}
              style={inputStyle}
            />

            {weekDates.length > 0 && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#f2f7ee", borderRadius: 6, fontSize: 13, color: "#3A6620" }}>
                <strong>Week:</strong> {weekLabel} &nbsp;|&nbsp;
                <strong>Days:</strong> {dayLabels.join(", ")} &nbsp;|&nbsp;
                <strong>Schedule:</strong> {isFourDay ? "4-day (Mon–Thu)" : "5-day (Mon–Fri)"}
              </div>
            )}

            {error && <div style={errorStyle}>{error}</div>}

            <button
              onClick={handleFetch}
              disabled={!foreman || !weekStart}
              style={{ ...btnStyle, marginTop: 28, opacity: (!foreman || !weekStart) ? 0.5 : 1 }}
            >
              Pull JotForm Data →
            </button>
          </div>
        )}

        {/* STEP 2: Fetching */}
        {step === "fetching" && (
          <div style={{ background: "white", borderRadius: 10, padding: 48, textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
            <div style={{ color: "#2D5016", fontWeight: 600, fontSize: 16 }}>Pulling data from JotForm…</div>
            <div style={{ color: "#666", fontSize: 13, marginTop: 8 }}>This usually takes 10–30 seconds</div>
          </div>
        )}

        {/* STEP 3: Manual entry */}
        {step === "manual" && fetchedData && (
          <div style={{ background: "white", borderRadius: 10, padding: 32, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <h2 style={{ margin: "0 0 6px", color: "#2D5016", fontSize: 18 }}>Review & Complete</h2>
            <p style={{ margin: "0 0 24px", color: "#666", fontSize: 13 }}>{foreman} · {weekLabel}</p>

            {/* Auto-fetched results */}
            <h3 style={subheadStyle}>Auto-Pulled from JotForm</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 24 }}>
              <thead>
                <tr style={{ background: "#2D5016", color: "white" }}>
                  <th style={thStyle}>Form</th>
                  {dayLabels.map(d => <th key={d} style={thStyle}>{d}</th>)}
                  <th style={thStyle}>Total</th>
                </tr>
              </thead>
              <tbody>
                {FORM_LABELS.map((label, i) => {
                  const d = fetchedData.results[label];
                  return (
                    <tr key={label} style={{ background: i % 2 === 0 ? "#f2f7ee" : "white" }}>
                      <td style={tdStyle}>{label}{d.error ? " ⚠️" : ""}</td>
                      {weekDates.map(date => (
                        <td key={date} style={{ ...tdStyle, textAlign: "center" }}>
                          {d.error ? "—" : ((d.dailyCounts[date] || 0) > 0 ? "✓" : "✗")}
                        </td>
                      ))}
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600 }}>
                        {d.error ? "ERR" : `${d.total}/${d.possible}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Manual entry */}
            <h3 style={subheadStyle}>Enter Manually</h3>
            <p style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>Check each day the form was submitted</p>

            {["Daily Job Notes", "Daily Job Photos"].map(label => (
              <div key={label} style={{ marginBottom: 20, padding: "14px 16px", background: "#f9fdf7", borderRadius: 8, border: "1px solid #d8ebc8" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#2D5016", marginBottom: 10 }}>{label}</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {weekDates.map((date, i) => (
                    <label key={date} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={manualDaily[label]?.[date] || false}
                        onChange={e => {
                          setManualDaily(prev => ({
                            ...prev,
                            [label]: { ...prev[label], [date]: e.target.checked }
                          }));
                          // Update total count
                          const newDays = { ...(manualDaily[label] || {}), [date]: e.target.checked };
                          const total = Object.values(newDays).filter(Boolean).length;
                          setManualCounts(prev => ({ ...prev, [label]: String(total) }));
                        }}
                      />
                      {dayLabels[i]}
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
                  Total: {Object.values(manualDaily[label] || {}).filter(Boolean).length}/{weekDates.length}
                </div>
              </div>
            ))}

            {error && <div style={errorStyle}>{error}</div>}

            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button onClick={resetForm} style={secondaryBtnStyle}>← Start Over</button>
              <button onClick={handleGenerate} style={btnStyle}>Generate PDF ↓</button>
            </div>
          </div>
        )}

        {/* STEP 4: Generating */}
        {step === "generating" && (
          <div style={{ background: "white", borderRadius: 10, padding: 48, textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>📄</div>
            <div style={{ color: "#2D5016", fontWeight: 600, fontSize: 16 }}>Generating PDF…</div>
          </div>
        )}

        {/* STEP 5: Done */}
        {step === "done" && (
          <div style={{ background: "white", borderRadius: 10, padding: 48, textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <div style={{ color: "#2D5016", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Scorecard Downloaded</div>
            <div style={{ color: "#666", fontSize: 14, marginBottom: 28 }}>{foreman} · {weekLabel}</div>
            <button onClick={resetForm} style={btnStyle}>Generate Another →</button>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: "#2D5016", marginBottom: 6 };
const selectStyle = { width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, background: "white" };
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, boxSizing: "border-box" };
const btnStyle = { background: "#2D5016", color: "white", border: "none", borderRadius: 6, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const secondaryBtnStyle = { background: "white", color: "#2D5016", border: "1px solid #2D5016", borderRadius: 6, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const errorStyle = { marginTop: 12, padding: "10px 14px", background: "#fdf2f2", border: "1px solid #f0c0c0", borderRadius: 6, color: "#c0392b", fontSize: 13 };
const subheadStyle = { fontSize: 13, fontWeight: 700, color: "#2D5016", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px", borderBottom: "2px solid #e8f2e0", paddingBottom: 6 };
const thStyle = { padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: 12 };
const tdStyle = { padding: "7px 10px", fontSize: 12, borderBottom: "1px solid #eee" };
