export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GROQ_API_KEY missing" }), { status: 500 });
  }

  // Expects multipart/form-data with a "file" field (audio blob)
  const formData = await req.formData();
  const audioFile = formData.get("file") as File;

  if (!audioFile) {
    return new Response(JSON.stringify({ error: "No audio file provided" }), { status: 400 });
  }

  // Forward to Groq Whisper
  const groqForm = new FormData();
  groqForm.append("file", audioFile, "recording.webm");
  groqForm.append("model", "whisper-large-v3");
  groqForm.append("response_format", "json");

  const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: groqForm,
  });

  const data = await groqRes.json();
  return new Response(JSON.stringify({ text: data.text || "" }), {
    headers: { "Content-Type": "application/json" },
  });
}
