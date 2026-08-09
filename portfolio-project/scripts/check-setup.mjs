import process from 'node:process';

try {
  process.loadEnvFile('.env');
} catch {}

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

if (!API_KEY) {
  console.error('GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
  console.error('Get a free key at https://aistudio.google.com/apikey');
  process.exit(1);
}

const listing = await fetch(`${BASE}/models`, { headers: { 'x-goog-api-key': API_KEY } });

if (!listing.ok) {
  console.error(`Could not list models: ${listing.status} ${listing.statusText}`);
  console.error(await listing.text());
  process.exit(1);
}

const { models = [] } = await listing.json();
const usable = models
  .filter(model => (model.supportedGenerationMethods ?? []).includes('generateContent'))
  .map(model => model.name.replace('models/', ''));

console.log(`Key works. ${usable.length} models available.`);
console.log(usable.filter(name => name.startsWith('gemini')).join('\n'));

if (!usable.includes(MODEL)) {
  console.error(`\nGEMINI_MODEL is "${MODEL}", which your key cannot reach.`);
  console.error('Pick one of the names above and put it in .env.');
  process.exit(1);
}

const ping = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: 'Reply with the word ready.' }] }]
  })
});

if (!ping.ok) {
  console.error(`\n${MODEL} rejected the request: ${ping.status}`);
  console.error(await ping.text());
  process.exit(1);
}

console.log(`\n${MODEL} responded. You are ready.`);
