# AI Study Assistant

AI Study Assistant is a Node.js toolchain for collecting study material from web pages, generating flashcards with an AI provider, and practicing those cards with a spaced-repetition workflow.

If you're just using the app, start with the setup and quick start sections below. If you're extending or maintaining it, the development notes and project structure sections are for you.

## Features

- Collect content from a URL with Playwright
- Generate flashcards from notes with Gemini, OpenAI, Anthropic, LM Studio, Ollama, or a custom OpenAI-compatible API
- Export flashcards to Anki, Quizlet, Markdown, Notion, and JSON
- Practice flashcards in the terminal and save session progress
- Keep generated notes and progress files on disk for later review

## Requirements

- Node.js 18 or newer
- npm
- A configured AI provider key or local model endpoint, depending on the provider you choose

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file:

   ```bash
   Copy-Item .env.example .env
   ```

3. Edit `.env` and choose a provider:

   - `AI_PROVIDER=gemini` uses `GEMINI_API_KEY`
   - `AI_PROVIDER=openai` uses `OPENAI_API_KEY`
   - `AI_PROVIDER=anthropic` uses `ANTHROPIC_API_KEY`
   - `AI_PROVIDER=lmstudio` uses a local LM Studio server
   - `AI_PROVIDER=ollama` uses a local Ollama server
   - `AI_PROVIDER=custom` uses `CUSTOM_BASE_URL` and `CUSTOM_API_KEY`

4. Verify the configured model in `.env` if you override the default `MODEL`.

## Quick Start

### 1. Collect material from a web page

```bash
npm run collect -- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
```

If no URL is passed, the collector uses a default MDN page. It writes a Markdown note and a matching JSON file into `notes/`.

### 2. Generate flashcards from the latest note

```bash
npm run generate
```

This picks the newest `.md` note in `notes/`, generates flashcards, and exports them in multiple formats next to the source note.

### 3. Practice flashcards interactively

```bash
npm run practice
```

If you do not pass a file, the app uses the newest `*-flashcards.json` file in `notes/`.

### 4. Review with spaced repetition

```bash
npm run review
```

### 5. Test the AI connection

```bash
npm run test-ai
```

## Available Scripts

- `npm run collect` - Scrape content from a URL and save it to `notes/`
- `npm run generate` - Generate flashcards from the latest collected note
- `npm run practice` - Start an interactive practice session
- `npm run review` - Run spaced-repetition review logic
- `npm run test-setup` - Run the environment/setup check helper
- `npm run test-ai` - Send a small prompt to the configured AI provider
- `npm run dev` - Alias for `npm run practice`

## Environment Variables

The `.env.example` file documents every supported variable. The most important ones are:

- `AI_PROVIDER` - Provider selector, defaults to `gemini`
- `MODEL` - Model name for the selected provider
- `GEMINI_API_KEY` - Required for Gemini
- `OPENAI_API_KEY` - Required for OpenAI
- `ANTHROPIC_API_KEY` - Required for Anthropic
- `LM_STUDIO_URL` - Local LM Studio endpoint
- `OLLAMA_URL` - Local Ollama endpoint
- `CUSTOM_BASE_URL` - Custom OpenAI-compatible base URL
- `CUSTOM_API_KEY` - Custom API key
- `HEADLESS` - Set to `false` to watch Playwright while collecting

## Output Folders

- `notes/` - Collected source notes and generated flashcard decks
- `progress/` - Practice session summaries and review state

Generated flashcards are exported as:

- `.anki.csv`
- `.quizlet.txt`
- `.md`
- `.notion.csv`
- `.json`

## For Developers

### Project Structure

- `src/collector.js` - Collects page content with Playwright
- `src/generate.js` - Generates flashcards from the latest note
- `src/flashcards.js` - Flashcard generation and file export helpers
- `src/practice.js` - Terminal practice flow
- `src/spaced-repetition.js` - Review scheduling logic
- `src/ai.js` - Provider routing and AI request handling
- `src/exporters.js` - Format-specific exporters
- `src/formatters.js` - Markdown formatting for collected material

### Development Notes

- The package uses ES modules (`"type": "module"`).
- Playwright is the browser automation dependency used by the collector.
- Flashcard generation expects the model to return valid JSON with `question`, `answer`, and `tags` fields.
- The generator reads the newest note file by filename sorting, so keep collected files named consistently.
- Practice sessions save progress automatically, so you can inspect prior runs in `progress/`.

### Extending The Tool

- The collector extracts headings, paragraphs, and code snippets from pages using Playwright.
- The generator expects flashcards to come back as valid JSON with `question`, `answer`, and `tags` fields.
- The exporter writes all supported output formats next to the source deck.
- The practice flow persists session summaries in `progress/` and updates review scheduling state.

## Common Issues

- If the collector cannot open a page, confirm the URL is reachable and that Playwright installed correctly.
- If AI calls fail, check the API key, model name, and provider endpoint in `.env`.
- If local providers fail, make sure LM Studio or Ollama is running before you retry.

## License

MIT