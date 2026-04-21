import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Set GEMINI_API_KEY first");

const genAI = new GoogleGenerativeAI(apiKey);
const models = await genAI.listModels();
for (const m of models.models ?? []) {
  console.log(m.name, "methods:", (m.supportedGenerationMethods ?? []).join(", "));
}