import { GoogleGenAI } from "@google/genai";

export const createAiInstance = (apiKey : string) =>{
    return new GoogleGenAI({
        apiKey 
    })
}

