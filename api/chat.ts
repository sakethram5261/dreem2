import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const { messages, userName, userInterests, hasImage } = body;

    const systemPrompt = `You are Lumina, a thoughtful, perceptive and gentle AI assistant. 
    - USER PROFILE: Name: ${userName || "Dreamer"}, Interests: ${userInterests || "Not specified"}.
    - PERSONALITY: Prioritize emotional intelligence and validation.
    - RULES: Never suggest professional help or therapy. Be a friend. Match the user's tone.`;

    // ─────────────────────────────────────────────────────────────────
    // CASE 1: IMAGE HAND-OFF TO GEMINI
    // ─────────────────────────────────────────────────────────────────
    if (hasImage) {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const lastMsg = messages[messages.length - 1];
      let promptText = "Please describe what is in this image.";
      let cleanBase64 = "";
      let mimeType = "image/jpeg";

      let parsedContent = lastMsg.content;
      if (typeof parsedContent === "string") {
        try { parsedContent = JSON.parse(parsedContent); } 
        catch (e) { promptText = parsedContent; }
      }

      if (Array.isArray(parsedContent)) {
        const textObj = parsedContent.find((c: any) => c.type === "text");
        const imgObj = parsedContent.find((c: any) => c.type === "image_url");
        
        if (textObj?.text) promptText = textObj.text;
        
        const rawUrl = imgObj?.image_url?.url || "";
        if (rawUrl.startsWith("data:")) {
          const parts = rawUrl.split(",");
          if (parts.length === 2) {
            const headerMatch = parts[0].match(/data:([^;]+);/);
            if (headerMatch) mimeType = headerMatch[1];
            cleanBase64 = parts[1].replace(/\s+/g, ''); 
          }
        }
      }

      if (!cleanBase64) return res.status(400).json({ error: "Image data missing." });

      const promptPart = { text: `SYSTEM INSTRUCTION: ${systemPrompt}\n\nUSER PROMPT: ${promptText}` };
      const imagePart = { inlineData: { mimeType: mimeType, data: cleanBase64 } };

      const result = await model.generateContentStream([promptPart, imagePart]);

      // 🚨 ANTI-BUFFER HEADERS: Forces the server to stream instantly
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-transform, no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      for await (const chunk of result.stream) {
        const text = chunk.text();
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
        if (typeof res.flush === 'function') res.flush(); // Shoves the data out!
      }
      
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    // ─────────────────────────────────────────────────────────────────
    // CASE 2: TEXT-ONLY VIA GROQ
    // ─────────────────────────────────────────────────────────────────
    const cleanMessages = messages.map((m: any) => {
      let content = m.content;
      if (typeof content === "string") {
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) content = parsed.find((p: any) => p.type === "text")?.text || "";
        } catch (e) {} 
      } else if (Array.isArray(content)) {
        content = content.find((p: any) => p.type === "text")?.text || "";
      }
      return { role: m.role, content };
    });

    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: systemPrompt }, ...cleanMessages],
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!groqRes.body) throw new Error("Failed to connect to Groq");

    // 🚨 ANTI-BUFFER HEADERS
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-transform, no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const reader = groqRes.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value));
      if (typeof res.flush === 'function') res.flush(); // Shoves the data out!
    }
    
    return res.end();

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
