import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API route for preset generation
  app.post("/api/generate-preset", async (req, res) => {
    try {
      const { text } = req.body;
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(500).json({ error: "GEMINI_API_KEY environment variable is required" });
      }

      const ai = new GoogleGenAI({ apiKey: key });

      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          masterAmount: { type: "number", description: "Global gain intensity 0.5 to 2.0" },
          motionAmount: { type: "number", description: "Modulation depth responding to audio envelopes 0.0 to 1.0" },
          spaceBreath: { type: "number", description: "Amount of space ducking/breathing 0.0 to 1.0" },
          airShimmer: { type: "number", description: "High frequency shimmer texture 0.0 to 1.0" },
          safetyLimit: { type: "number", description: "Limiter threshold in dB, e.g. -1.0" },
          dramaticMode: { type: "boolean", description: "Whether to enable experimental dramatic reactivity" },
          dramaticAmount: { type: "number", description: "Amount of dramatic reactivity 0.0 to 1.0" },
          low: {
            type: "object",
            properties: {
              gain: { type: "number", description: "Gain 0.0 to 3.0" },
              drive: { type: "number", description: "Saturation drive 0.0 to 1.0" },
              filterCutoff: { type: "number", description: "Filter cutoff around 150-300Hz" }
            },
            required: ["gain", "drive", "filterCutoff"]
          },
          mid: {
            type: "object",
            properties: {
              gain: { type: "number", description: "Gain 0.0 to 3.0" },
              drive: { type: "number", description: "Saturation drive 0.0 to 1.0" },
              filterCutoff: { type: "number", description: "Filter cutoff around 1000-3000Hz" }
            },
            required: ["gain", "drive", "filterCutoff"]
          },
          high: {
            type: "object",
            properties: {
              gain: { type: "number", description: "Gain 0.0 to 3.0" },
              drive: { type: "number", description: "Saturation drive 0.0 to 1.0" },
              filterCutoff: { type: "number", description: "Filter cutoff around 6000-12000Hz" }
            },
            required: ["gain", "drive", "filterCutoff"]
          },
          space: {
            type: "object",
            properties: {
              mix: { type: "number", description: "Reverb/Delay Mix 0.0 to 1.0" },
              irType: { type: "string", enum: ["Pillowy", "Tape", "Cathedral", "Tight", "Air", "Wide"] },
              delayTime: { type: "number", description: "Delay time in seconds 0.05 to 2.0" },
              delayFeedback: { type: "number", description: "Delay feedback 0.0 to 0.95" }
            },
            required: ["mix", "irType", "delayTime", "delayFeedback"]
          }
        },
        required: ["name", "masterAmount", "motionAmount", "spaceBreath", "airShimmer", "safetyLimit", "dramaticMode", "dramaticAmount", "low", "mid", "high", "space"]
      };

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `You are an audio mastering expert. Give me a multiband processing preset described by: "${text}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      if (!response.text) throw new Error("No response text");
      
      const parsed = JSON.parse(response.text);
      res.json(parsed);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
