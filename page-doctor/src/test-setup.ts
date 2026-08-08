import 'dotenv/config';

console.log('\n Checking setup...\n');

const checks: boolean[] = [];

const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
if (majorVersion >= 18) {
  console.log(' Node.js version:', nodeVersion);
  checks.push(true);
} else {
  console.log(' Node.js too old. Need 18 or newer, got:', nodeVersion);
  console.log('   Download from: https://nodejs.org/');
  checks.push(false);
}

for (const pkg of ['playwright', 'openai', 'chalk']) {
  try {
    await import(pkg);
    checks.push(true);
  } catch {
    console.log(` ${pkg} not installed. Run: npm install`);
    checks.push(false);
  }
}
if (checks.slice(1).every(Boolean)) console.log(' Dependencies installed');

try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  await browser.close();
  console.log(' Playwright browsers installed');
  checks.push(true);
} catch {
  console.log(' Playwright browsers missing. Run: npx playwright install chromium');
  checks.push(false);
}

const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

const KEY_FOR_PROVIDER: Record<string, { env: string; url: string }> = {
  gemini: { env: 'GEMINI_API_KEY', url: 'https://aistudio.google.com/apikey' },
  openai: { env: 'OPENAI_API_KEY', url: 'https://platform.openai.com/api-keys' },
  anthropic: { env: 'ANTHROPIC_API_KEY', url: 'https://platform.claude.com/' },
  custom: { env: 'CUSTOM_API_KEY', url: 'your providers dashboard' }
};

console.log(`\n   AI provider: ${provider}`);

if (provider === 'lmstudio' || provider === 'ollama' || provider === 'local') {
  const url =
    provider === 'ollama'
      ? process.env.OLLAMA_URL || 'http://localhost:11434/v1'
      : process.env.LM_STUDIO_URL || 'http://localhost:1234/v1';

  try {
    const response = await fetch(`${url}/models`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(` Local AI server reachable at ${url}`);
    checks.push(true);
  } catch {
    console.log(` No local AI server at ${url}`);
    console.log(
      `   Start ${provider === 'ollama' ? 'Ollama (ollama serve)' : 'the LM Studio server'} and try again.`
    );
    checks.push(false);
  }
} else {
  const { env, url } = KEY_FOR_PROVIDER[provider] ?? KEY_FOR_PROVIDER.gemini;
  const key = process.env[env];

  if (key && !key.startsWith('your_')) {
    console.log(` ${env} configured`);
    checks.push(true);
  } else {
    console.log(`  ${env} not set. Add it to .env (copy .env.example first)`);
    console.log(`   Get a key at: ${url}`);
    checks.push(false);
  }
}

try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');
  await browser.close();
  console.log(' Chrome DevTools Protocol reachable');
  checks.push(true);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.log(' Could not open a CDP session:', message);
  checks.push(false);
}

console.log(`\n${'─'.repeat(50)}`);
const passed = checks.filter(Boolean).length;
const total = checks.length;

if (passed === total) {
  console.log('\n Setup complete! Try: npm run demo\n');
  process.exit(0);
} else {
  console.log(`\n  Setup incomplete: ${passed}/${total} checks passed`);
  console.log('Fix the issues above and run this script again.\n');
  process.exit(1);
}
