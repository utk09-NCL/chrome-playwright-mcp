# Page Doctor Setup

This guide covers the local setup required to run Page Doctor without committing API credentials to GitHub.

## Requirements

- Node.js 18 or newer
- npm
- A supported AI provider API key, if AI analysis is enabled

## Install

From the repository root:

```bash
cd page-doctor
npm install
```

## Configure environment variables

Copy the example environment file to a local `.env` file.

### macOS / Linux

```bash
cp .env.example .env
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace the placeholder values for the provider you intend to use. For example:

```env
OPENAI_API_KEY=YOUR_API_KEY_HERE
OPENAI_BASE_URL=https://api.openai.com/v1
```

If an OpenAI-compatible provider uses a custom endpoint, set its documented base URL in the appropriate environment variable rather than committing credentials into a URL or Markdown file.

> [!IMPORTANT]
> Never commit a real API key. Keep secrets in the local `.env` file. The repository's `.env.example` should contain placeholders only.

## Verify the setup

Run:

```bash
npm run test-setup
```

The package script executes `node src/test-setup.js` and checks the Page Doctor setup.

## Other available commands

```bash
npm run diagnose
npm run demo
npm run compare
npm run test-ai
```

Refer to `package.json` for the current command definitions and supported dependencies.
