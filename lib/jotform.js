const API_KEY = process.env.JOTFORM_API_KEY;
const BASE = "https://api.jotform.com";

export const FORMS = {
  "4@12 Daily Check-In":        "252195864467066",
  "Truck Pre & Post Trip":      "252056379855064",
  "Equipment Pre & Post Trip":  "252056852468262",
  "FLHA / Hazard Assessment":   "252055853997067",
  "Truck Inspection Checklist": "252257571229056",
};

export const FOREMEN = [
  "Andrew Hurley",
  "Charlie Kinloch",
  "Chris Schiewe",
  "Josh Araujo",
  "Marcus Harder",
  "Matthew Slinn",
  "Patrick Breault",
];

// 4x10 foremen work Mon–Thu only
export const FOUR_DAY_FOREMEN = ["Charlie Kinloch", "Matthew Slinn"];

export function getWorkingDays(startDateStr, foreman) {
  const isFourDay = FOUR_DAY_FOREMEN.includes(foreman);
  const days = [];
  const start = new Date(startDateStr + "T12:00:00Z");
  const count = isFourDay ? 4 : 5;
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

async function fetchAllSubmissions(formId, startDate, endDate) {
  const allSubs = [];
  let offset = 0;
  const limit = 1000;

  const filterObj = {
    "created_at:gte": `${startDate} 00:00:00`,
    "created_at:lte": `${endDate} 23:59:59`,
  };
  const filterStr = encodeURIComponent(JSON.stringify(filterObj));

  while (true) {
    const url = `${BASE}/form/${formId}/submissions?apiKey=${API_KEY}&limit=${limit}&offset=${offset}&filter=${filterStr}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`JotForm API error ${res.status} for form ${formId}: ${text}`);
    }
    const data = await res.json();
    const subs = data.content || [];
    allSubs.push(...subs);
    if (subs.length < limit) break;
    offset += limit;
  }
  return allSubs;
}

function getForomanName(submission) {
  const answers = submission.answers || {};
  for (const key of Object.keys(answers)) {
    const field = answers[key];
    const fieldName = (field.name || "").toLowerCase();
    const fieldText = (field.text || "").toLowerCase();
    if (fieldName.includes("foreman") || fieldText.includes("foreman")) {
      const answer = field.answer;
      if (typeof answer === "string") return answer.trim();
      if (answer && typeof answer === "object") {
        return (answer.first || "" + " " + (answer.last || "")).trim();
      }
    }
  }
  return null;
}

function getSubmissionDate(submission) {
  // created_at format: "2026-06-15 08:23:11"
  return submission.created_at?.split(" ")[0] || null;
}

export async function fetchScorecardData(foreman, startDate, endDate) {
  const workingDays = getWorkingDays(startDate, foreman);
  const results = {};

  for (const [formLabel, formId] of Object.entries(FORMS)) {
    const dailyCounts = {};
    for (const d of workingDays) dailyCounts[d] = 0;

    let error = null;
    try {
      const subs = await fetchAllSubmissions(formId, startDate, endDate);
      for (const sub of subs) {
        const name = getForomanName(sub);
        if (!name) continue;
        if (name.toLowerCase() !== foreman.toLowerCase()) continue;
        const date = getSubmissionDate(sub);
        if (date && dailyCounts.hasOwnProperty(date)) {
          dailyCounts[date]++;
        }
      }
    } catch (e) {
      error = e.message;
    }

    results[formLabel] = {
      dailyCounts,
      total: Object.values(dailyCounts).reduce((a, b) => a + b, 0),
      possible: workingDays.length,
      error,
    };
  }

  return { results, workingDays };
}
