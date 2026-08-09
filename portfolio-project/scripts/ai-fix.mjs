import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { promisify } from 'node:util';

const run = promisify(execFile);

try {
  process.loadEnvFile('.env');
} catch {}

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
const RESULTS_FILE = 'broken-results.json';
const SPEC_FILE = 'tests/debug-me.broken.spec.ts';
const OUTPUT_FILE = 'tests/debug-me.fixed.spec.ts';
const SOURCE_FILES = [
  'src/App.tsx',
  'src/components/Navbar.tsx',
  'src/components/Footer.tsx',
  'src/components/ProjectCard.tsx',
  'src/components/ThemeToggle.tsx',
  'src/pages/Home.tsx',
  'src/pages/Projects.tsx',
  'src/pages/Contact.tsx',
  'src/data/projects.ts'
];

if (!API_KEY) {
  console.error('GEMINI_API_KEY is not set. Run npm run check-setup first.');
  process.exit(1);
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function stripAnsi(value) {
  return value.replace(ANSI, '');
}

function collectFailures(node, found = []) {
  for (const suite of node.suites ?? []) collectFailures(suite, found);
  for (const spec of node.specs ?? []) {
    if (spec.ok) continue;
    for (const testCase of spec.tests ?? []) {
      for (const result of testCase.results ?? []) {
        for (const error of result.errors ?? []) {
          found.push({
            title: spec.title,
            line: spec.line,
            message: stripAnsi(error.message ?? '')
          });
        }
      }
    }
  }
  return found;
}

console.log('Running the broken suite to collect real Playwright errors...');

try {
  await run(
    'npx',
    ['playwright', 'test', `--config=playwright.broken.config.ts`, '--reporter=json'],
    {
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: RESULTS_FILE },
      maxBuffer: 32 * 1024 * 1024
    }
  );
} catch {}

const report = JSON.parse(await readFile(RESULTS_FILE, 'utf8'));
const failures = collectFailures(report);

if (failures.length === 0) {
  console.log('Nothing failed. There is nothing to fix.');
  process.exit(0);
}

console.log(`Found ${failures.length} failing test(s). Asking ${MODEL} for fixes...\n`);

const specSource = await readFile(SPEC_FILE, 'utf8');
const appSource = (
  await Promise.all(
    SOURCE_FILES.map(async file => `--- ${file} ---\n${await readFile(file, 'utf8')}`)
  )
).join('\n\n');

const failureText = failures
  .map(
    (failure, index) =>
      `Failure ${index + 1} — "${failure.title}" (line ${failure.line})\n${failure.message}`
  )
  .join('\n\n');

const prompt = `You are fixing a Playwright test file for a React portfolio site.

The application source is correct. Only the test file is wrong. Never suggest changing the app.

Application source:
${appSource}

Test file (${SPEC_FILE}):
${specSource}

Playwright output:
${failureText}

For each failure, identify the root cause and name the Playwright concept it teaches.
Then return the complete corrected test file.

Rules for the corrected file:
- Prefer getByRole and getByLabel; use getByTestId only when no accessible name exists.
- Never use page.waitForTimeout.
- Await every assertion.
- Keep the existing test titles.
- No comments anywhere in the file.`;

const schema = {
  type: 'object',
  properties: {
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          testTitle: { type: 'string' },
          rootCause: { type: 'string' },
          playwrightConcept: { type: 'string' },
          fix: { type: 'string' }
        },
        required: ['testTitle', 'rootCause', 'playwrightConcept', 'fix']
      }
    },
    correctedFile: { type: 'string' }
  },
  required: ['fixes', 'correctedFile']
};

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    })
  }
);

if (!response.ok) {
  console.error(`Gemini request failed: ${response.status}`);
  console.error(await response.text());
  process.exit(1);
}

const payload = await response.json();
const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;

if (!text) {
  console.error('Gemini returned no content.');
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

const { fixes, correctedFile } = JSON.parse(text);

for (const [index, fix] of fixes.entries()) {
  console.log(`${index + 1}. ${fix.testTitle}`);
  console.log(`   concept:  ${fix.playwrightConcept}`);
  console.log(`   cause:    ${fix.rootCause}`);
  console.log(`   fix:      ${fix.fix}\n`);
}

await writeFile(OUTPUT_FILE, correctedFile.endsWith('\n') ? correctedFile : `${correctedFile}\n`);

console.log(`Wrote ${OUTPUT_FILE}`);
console.log('Run npm test to check the fixes.');
