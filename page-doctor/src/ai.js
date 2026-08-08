import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from "@google/genai";

const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
const MODEL = process.env.MODEL || 'gemini-3.1-flash-lite';

function extractInteractionText(interaction) {
  if (typeof interaction.output_text === 'string' && interaction.output_text.trim()) {
    return interaction.output_text.trim();
  }

  const chunks = []
  for (const step of interaction.output_messages ?? []) {
    if (step.type !==  'model_output') continue;

    for (const part of step.content ?? []) {
      if (part.type === 'text' && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }
  return chunks.join(' ');
}

export async function askAI(systemPrompt, userPrompt) {
  const temperature = 0.7; 
  const maxOutputTokens = 150; 
  const retries = 2;

  console.log(`Asking AI (${AI_PROVIDER} - ${MODEL})...`);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (AI_PROVIDER === 'gemini') {
        const ai = new GoogleGenAI({
          apiKey: process.env.GOOGLE_API_KEY
        });
        const interaction = await ai.interactions.create({
          model: MODEL,
          system_instruction: systemPrompt,
          input: userPrompt,
          generation_config: {
            temperature: temperature,
            max_output_tokens: maxOutputTokens,
          },
        });
        console.log(interaction.output_text);

        return extractInteractionText(interaction);
      }
    } catch (error) {
      console.error(`Error while asking AI (attempt ${attempt} of ${retries}):`, error);
      if (attempt === retries) {
        throw error;
      }
    }
  }

  console.log('AI integration not implemented yet for the selected provider or model.');
  return null;
}

export async function testAI() {
  console.log('\nTesting AI connection...\n');

  try {
    const systemPrompt = 'You are a helpful assistant helpinh users debug their ocde using chtome mcp and playwright. Provide concise and accurate answers.';
    const userPrompt = 'What is the best way to debug a failing test in Playwright?';
    const response = await askAI(systemPrompt, userPrompt);
    console.log('AI Response:', response);
  } catch (error) {
    console.error('Error during AI test:', error);
  }

  // console.log('Test function not implemented yet...');
  //return false;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await testAI();
}
