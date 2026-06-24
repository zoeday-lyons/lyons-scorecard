import { fetchScorecardData } from "../../lib/jotform";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { foreman, startDate, endDate, workingDays } = req.body;
  if (!foreman || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing foreman, startDate, or endDate" });
  }

  try {
    const data = await fetchScorecardData(foreman, startDate, endDate, workingDays);
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
