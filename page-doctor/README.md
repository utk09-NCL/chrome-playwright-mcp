# Page Doctor

Page Doctor is an AI-powered Node.js tool for auditing web pages with
real browser measurements from Playwright and the Chrome DevTools
Protocol. It collects Core Web Vitals, network information, code
coverage, DOM metrics, console errors, and browser warnings, then uses a
configurable AI provider to turn those measurements into ranked,
actionable performance findings.

If you're just using the tool, start with the setup and quick start
sections below. If you're extending or maintaining it, the project
structure and development notes explain the main components.

## Features

-   Audit any reachable web page with Playwright and Chromium
-   Measure LCP, FCP, CLS, Total Blocking Time, and TTFB
-   Capture network requests, transferred bytes, failed requests, and
    render-blocking resources
-   Detect JavaScript errors, console warnings, browser warnings, layout
    shifts, and long tasks
-   Measure unused JavaScript and CSS using browser coverage data
-   Analyze real measurements with Gemini, OpenAI, Anthropic, LM Studio,
    Ollama, or a custom OpenAI-compatible API
-   Generate ranked findings with severity, evidence, concrete fixes,
    and estimated impact
-   Compare page performance across different network and CPU throttling
    presets
-   Export reports as Markdown, HTML, and JSON
-   Includes a built-in broken-page demo for testing the complete
    workflow

## Requirements

-   Node.js 18 or newer
-   npm
-   Chromium/Playwright browser support
-   A configured AI provider key or local model endpoint, depending on
    the provider you choose

## Setup

1.  Install dependencies:

    ``` bash
    npm install
    ```

2.  Create your local environment file:

    ``` powershell
    Copy-Item .env.example .env
    ```

3.  Edit `.env` and choose an AI provider:

    -   `AI_PROVIDER=gemini` uses `GEMINI_API_KEY`
    -   `AI_PROVIDER=openai` uses `OPENAI_API_KEY`
    -   `AI_PROVIDER=anthropic` uses `ANTHROPIC_API_KEY`
    -   `AI_PROVIDER=lmstudio` uses a local LM Studio server
    -   `AI_PROVIDER=ollama` uses a local Ollama server
    -   `AI_PROVIDER=custom` uses `CUSTOM_BASE_URL` and `CUSTOM_API_KEY`

4.  Verify `MODEL` if you want to override the provider's default model.

5.  Run the setup check:

    ``` bash
    npm run test-setup
    ```

    The setup checker validates the AI configuration/local endpoint and
    confirms that Playwright can establish a Chrome DevTools Protocol
    session.

## Quick Start

### 1. Audit a web page

``` bash
npm run diagnose -- https://example.com
```

The default audit uses the `mobile` throttling preset and waits 3000 ms
after page load for measurements to settle.

You can choose another preset:

``` bash
npm run diagnose -- https://example.com --throttle=slow-3g
```

Available presets:

-   `mobile` - Lighthouse-style mobile conditions; default
-   `slow-3g` - Very slow network and CPU conditions
-   `desktop` - Fast connection with minimal CPU slowdown
-   `none` - No network or CPU throttling

### 2. Run the built-in demo

``` bash
npm run demo
```

The demo starts a local server and audits an intentionally broken page
containing issues such as a JavaScript error, unhandled rejection,
failed request, layout shift, and unused CSS.

### 3. Compare throttling conditions

``` bash
npm run compare -- https://example.com
```

By default, this compares `none` against `mobile`.

You can choose both presets:

``` bash
npm run compare -- https://example.com --from=none --to=slow-3g
```

The comparison focuses on LCP, FCP, Total Blocking Time, CLS, and TTFB.

### 4. Test the AI connection

``` bash
npm run test-ai
```

This sends a small diagnostic prompt to the configured AI provider and
confirms whether the connection is working.

## Available Scripts

-   `npm run diagnose -- <url>` - Run a complete page audit, AI
    analysis, terminal report, and saved report artifacts
-   `npm run demo` - Run the built-in intentionally broken demo page
-   `npm run compare -- <url>` - Compare performance between two
    throttling presets
-   `npm run test-ai` - Test the configured AI provider connection
-   `npm run test-setup` - Check AI configuration and Playwright/CDP
    availability

## Environment Variables

The `.env.example` file documents the supported provider configuration.
The main variables are:

-   `AI_PROVIDER` - Provider selector; defaults to `gemini`
-   `MODEL` - Model identifier for the selected provider
-   `GEMINI_API_KEY` - Required for Gemini
-   `OPENAI_API_KEY` - Required for OpenAI
-   `ANTHROPIC_API_KEY` - Required for Anthropic
-   `LM_STUDIO_URL` - Local LM Studio OpenAI-compatible endpoint
-   `OLLAMA_URL` - Local Ollama OpenAI-compatible endpoint
-   `CUSTOM_BASE_URL` - Custom OpenAI-compatible API endpoint
-   `CUSTOM_API_KEY` - API key for a custom provider
-   `HEADLESS` - Set to `false` to watch Chromium while auditing

### AI Provider Examples

#### Gemini

``` env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_key_here
MODEL=gemini-3.1-flash-lite
```

#### OpenAI

``` env
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_key_here
MODEL=gpt-4o-mini
```

#### Anthropic

``` env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_key_here
MODEL=claude-haiku-4-5
```

#### LM Studio

``` env
AI_PROVIDER=lmstudio
LM_STUDIO_URL=http://localhost:1234/v1
MODEL=local-model
```

#### Ollama

``` env
AI_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434/v1
MODEL=qwen2.5:latest
```

#### Custom OpenAI-Compatible API

``` env
AI_PROVIDER=custom
CUSTOM_BASE_URL=http://your-server:port/v1
CUSTOM_API_KEY=your_key_here
MODEL=your-model-name
```

## Audit Options

The diagnosis command accepts additional options after `--`.

### Throttling

``` bash
npm run diagnose -- https://example.com --throttle=desktop
```

Use `mobile`, `slow-3g`, `desktop`, or `none`.

### Settle Time

Increase the amount of time Page Doctor waits after navigation:

``` bash
npm run diagnose -- https://example.com --settle=5000
```

The default is `3000` milliseconds.

### Watch the Browser

Audits are headless by default. To watch Chromium while the audit runs:

``` env
HEADLESS=false
```

## Output

Page Doctor saves generated reports in the `reports/` directory.

Each diagnosis produces:

-   `.md` - Human-readable Markdown report
-   `.html` - Browser-friendly HTML report
-   `.json` - Structured audit and analysis data

The Markdown report includes the tested URL, test conditions, Core Web
Vitals, page weight, largest resources, failed requests, AI findings,
and console information.



### Core Web Vitals and Timing

-   Largest Contentful Paint (LCP)
-   First Contentful Paint (FCP)
-   Cumulative Layout Shift (CLS)
-   Total Blocking Time (TBT)
-   Time to First Byte (TTFB)
-   Page load timing

### Network

-   Total request count
-   Total transferred bytes
-   Requests grouped by resource type
-   Largest resources
-   Failed requests
-   Slow scripts and stylesheets

### Runtime and Browser Diagnostics

-   JavaScript exceptions
-   Console errors and warnings
-   Browser warnings
-   Layout shifts and affected elements
-   Long tasks
-   DOM node count
-   JavaScript heap usage
-   Layout and style recalculation counts

### Code Coverage

Page Doctor uses Playwright coverage data to estimate unused JavaScript
and CSS and identifies files with significant unused code.

## AI Analysis

The AI analyzer receives a compact digest of the measured audit data
rather than inventing measurements. Findings are ranked by practical
user impact and include:

-   `severity` - `critical`, `warning`, or `info`
-   `category` - `performance`, `javascript`, `network`, or
    `best-practice`
-   `evidence` - Actual measurements from the audit
-   `fix` - A concrete, actionable change
-   `impact` - An estimated improvement tied to a metric

AI output is intended as engineering guidance; verify recommendations
against your application before applying them.

## For Developers

### Project Structure

-   `src/ai.js` - AI provider routing, model configuration, retries,
    errors, and AI connection testing
-   `src/audit.js` - Playwright/CDP browser audit and performance data
    collection
-   `src/analyze.js` - Converts audit data into an AI digest and ranked
    findings
-   `src/diagnose.js` - Main end-to-end diagnosis workflow
-   `src/compare.js` - Compares audit results between throttling presets
-   `src/demo.js` - Starts the local broken-page demo and runs a
    diagnosis
-   `src/report.js` - Terminal, Markdown, HTML, and JSON report
    generation
-   `src/vitals.js` - Core Web Vitals thresholds, ratings, formatting,
    and utility functions
-   `src/test-setup.js` - Environment, AI provider, and CDP setup
    validation
-   `demo/broken-page.html` - Intentionally problematic page used by the
    demo workflow

### Development Notes

-   The package uses ES modules through `"type": "module"`.
-   Playwright is responsible for browser automation and performance
    collection.
-   Chrome DevTools Protocol is used to access network, runtime, log,
    and performance information.
-   The default audit throttling preset is `mobile`.
-   The default settle time is 3000 ms.
-   AI analysis uses a low temperature to keep diagnosis results
    consistent between runs.
-   AI findings are expected to reference measurements captured by the
    browser rather than invented values.
-   The project requires Node.js 18 or newer.



-   Add or modify throttling presets in `src/audit.js`.
-   Extend the collected audit data in the Playwright/CDP
    instrumentation.
-   Add new metrics to the normalized report structure in
    `src/audit.js`.
-   Update `src/analyze.js` when adding new AI finding categories or
    output fields.
-   Extend `src/report.js` to expose additional audit information in
    Markdown, HTML, JSON, or terminal output.
-   Add new AI providers through the provider configuration in
    `src/ai.js`.
-   Add new CLI options by extending the argument parsing in
    `src/diagnose.js` or `src/compare.js`.

## Common Issues

-   If `npm run test-setup` reports that the AI key is missing, copy
    `.env.example` to `.env` and configure the variable required by your
    selected provider.
-   If Gemini/OpenAI/Anthropic requests fail, verify the API key,
    provider, and model configured in `.env`.
-   If LM Studio or Ollama cannot be reached, make sure the local server
    is running and that its URL matches `LM_STUDIO_URL` or `OLLAMA_URL`.
-   If Playwright cannot launch Chromium or establish CDP, verify the
    Playwright installation and browser environment.
-   If a page cannot be loaded, confirm the URL includes `https://` or
    `http://` and is reachable from the machine running Page Doctor.
-   If results are unstable, keep the default throttling and settle time
    or increase `--settle` for pages with delayed content.

## License

MIT
