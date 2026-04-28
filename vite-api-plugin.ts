/**
 * vite-api-plugin.ts  (v4 — self-contained, zero SSR issues)
 *
 * Implements the /api/chat route directly inside this plugin.
 * No dynamic imports, no ssrLoadModule, no tsx tricks.
 * Uses only fetch() + @google/generative-ai (loaded via standard require).
 */

import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/* ── Env loader ─────────────────────────────────────────────────────────── */
function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function getRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* ── Core chat handler (inlined — no import issues) ─────────────────────── */
async function handleChat(body: any, res: ServerResponse) {
  const { messages, userName, hasImage } = body;

  const GROQ_KEY   = process.env.GROQ_API_KEY   || process.env.VITE_GROQ_API_KEY   || '';
  const GEMINI_KEY = process.env.GEMINI_API_KEY  || process.env.VITE_GEMINI_API_KEY || '';

  const systemPrompt = `You are Lumina, a thoughtful, perceptive and gentle AI assistant.
- USER PROFILE: Name: ${userName || 'Friend'}.
- PERSONALITY: Prioritize emotional intelligence and validation.
- RULES: Never suggest professional help or therapy. Be a friend. Match the user's tone.`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-transform, no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── IMAGE → Gemini ───────────────────────────────────────────────────────
  if (hasImage) {
    if (!GEMINI_KEY) {
      res.end('data: {"choices":[{"delta":{"content":"Gemini API key missing."}}]}\n\ndata: [DONE]\n\n');
      return;
    }

    try {
      // Use require so Node resolves from node_modules
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(GEMINI_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const lastMsg = messages[messages.length - 1];
      let promptText = 'Please describe what is in this image.';
      let cleanBase64 = '';
      let mimeType = 'image/jpeg';

      let content = lastMsg.content;
      if (typeof content === 'string') { try { content = JSON.parse(content); } catch {} }
      if (Array.isArray(content)) {
        const textObj = content.find((c: any) => c.type === 'text');
        const imgObj  = content.find((c: any) => c.type === 'image_url');
        if (textObj?.text) promptText = textObj.text;
        const rawUrl = imgObj?.image_url?.url || '';
        if (rawUrl.startsWith('data:')) {
          const parts = rawUrl.split(',');
          if (parts.length === 2) {
            const m = parts[0].match(/data:([^;]+);/);
            if (m) mimeType = m[1];
            cleanBase64 = parts[1].replace(/\s+/g, '');
          }
        }
      }

      const result = await model.generateContentStream([
        { text: `SYSTEM: ${systemPrompt}\n\nUSER: ${promptText}` },
        { inlineData: { mimeType, data: cleanBase64 } },
      ]);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
      }
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `Error: ${e.message}` } }] })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  // ── TEXT → Groq ──────────────────────────────────────────────────────────
  if (!GROQ_KEY) {
    res.write('data: {"choices":[{"delta":{"content":"Groq API key missing. Check .env.local"}}]}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const cleanMessages = messages.map((m: any) => {
    let c = m.content;
    if (typeof c === 'string') { try { const p = JSON.parse(c); if (Array.isArray(p)) c = p.find((x: any) => x.type === 'text')?.text || ''; } catch {} }
    else if (Array.isArray(c)) c = c.find((x: any) => x.type === 'text')?.text || '';
    return { role: m.role, content: c };
  });

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...cleanMessages],
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `Groq error ${groqRes.status}: ${err}` } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    if (!groqRes.body) throw new Error('No body from Groq');

    const reader = groqRes.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value));
    }
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `Network error: ${e.message}` } }] })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

/* ── Vite plugin ────────────────────────────────────────────────────────── */
export function localApiPlugin(): Plugin {
  const root = process.cwd();

  // Load env at startup
  const envVars = {
    ...loadEnvFile(resolve(root, '.env')),
    ...loadEnvFile(resolve(root, '.env.local')),
  };
  for (const [k, v] of Object.entries(envVars)) {
    process.env[k] = v;
    if (k.startsWith('VITE_')) process.env[k.slice(5)] = v;
  }

  // Log key status
  const groqKey  = process.env.GROQ_API_KEY  || process.env.VITE_GROQ_API_KEY  || '';
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
  console.log(`\n[api-plugin] GROQ key : ${groqKey  ? '✓ loaded (' + groqKey.slice(0,8)  + '...)' : '✗ MISSING'}`);
  console.log(`[api-plugin] GEMINI key: ${geminiKey ? '✓ loaded (' + geminiKey.slice(0,8) + '...)' : '✗ MISSING'}\n`);

  return {
    name: 'local-api-routes',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (
        req: IncomingMessage,
        res: ServerResponse,
        next: () => void,
      ) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/')) return next();

        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 204;
          return res.end();
        }

        const route = url.split('?')[0].replace(/^\/api\//, '');

        try {
          const raw = await getRawBody(req);
          let body: any = {};
          if (raw.length > 0) { try { body = JSON.parse(raw.toString('utf8')); } catch {} }

          if (route === 'chat') {
            await handleChat(body, res);
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: `Unknown route /api/${route}` }));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[api-plugin] FATAL /api/${route}:`, msg);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: msg }));
          }
        }
      });
    },
  };
}
