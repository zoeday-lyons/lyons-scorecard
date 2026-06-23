# Lyons Scorecard Generator

Web app to generate foreman performance scorecards by pulling JotForm data and producing a PDF.

## Deploy to Vercel

### 1. Push to GitHub
- Create a new repo on GitHub (e.g. `lyons-scorecard`)
- Upload all these files, or push via git

### 2. Connect to Vercel
- Go to vercel.com → Add New Project
- Import your GitHub repo
- Framework: Next.js (auto-detected)

### 3. Add Environment Variable
In Vercel project settings → Environment Variables:
- Name: `JOTFORM_API_KEY`
- Value: your JotForm API key

### 4. Deploy
Click Deploy. That's it.

## Usage
1. Select foreman
2. Pick any date in the target week
3. Click "Pull JotForm Data" — waits ~15s while it hits each form
4. Review auto-pulled counts, fill in FLHA / Job Notes / Photos manually
5. Click "Generate PDF" — downloads instantly
