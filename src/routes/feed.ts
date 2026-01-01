import { Hono } from "hono";
import { prompt } from "../lib/prompt";
import { createAiInstance } from "../lib/ai";
import { GoogleGenAI } from "@google/genai";
import { searchOnYt } from "../lib/ytSearch";
import { cosineSimilarity } from "../lib/cosineSimilarity";


export const feedRouter = new Hono<{
    Bindings: {
        GOOGLE_GEMINI_API_KEY: string,
        YOUTUBE_API_KEY: string,
        AI: Ai
    }
}>();

let ai: GoogleGenAI;


feedRouter.get("/feed", async (c) => {
    const userPrompt = "system design"
    if (!ai) {
        ai = createAiInstance(c.env.GOOGLE_GEMINI_API_KEY);
    }
    //put guard rails here to prevent model abuse
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt.replace("<USER_PROMPT>", userPrompt)
    });

    const responseArray = JSON.parse(response.text!);
    console.log(responseArray);
    // const responseArray = ["system design" , "interview system design" , "building fault tolerant systems"]; 
    // generate five search results based on user's prompt
    const videos = await searchOnYt(responseArray, c.env.YOUTUBE_API_KEY);
    const videoTexts = videos.map((video) => {
        return `${video.snippet.title} ${video.snippet.description}`
    })

    const embeddings = await c.env.AI.run('@cf/qwen/qwen3-embedding-0.6b', {
        text: [userPrompt, ...videoTexts]
    })


    // const userVector = embeddings.embeddings?.[0].values;
    const userVector = embeddings.data?.[0];
    const now = new Date();

    const videosWithEmbeddings = videos.map((video, index) => {
        const videoVector = embeddings.data?.[index + 1];
        const semanticScore = cosineSimilarity(userVector!, videoVector!)
        const publishedDate = new Date(video.snippet.publishedAt);
        const daysSincePublished = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
        const recencyScore = Math.exp(-daysSincePublished / 30);

        
        const SEMANTIC_WEIGHT = 0.7;  
        const RECENCY_WEIGHT = 0.3;   

        const finalScore = (semanticScore * SEMANTIC_WEIGHT) + (recencyScore * RECENCY_WEIGHT);


        return {
            ...video,
            embedding: videoVector,
            similarityScore: finalScore
        }
    });

    // //rank the videos with the similarity score now 
    const rankedVideos = videosWithEmbeddings.sort((a, b) =>
        b.similarityScore - a.similarityScore
    ).slice(0,35);

    return c.json(rankedVideos);
})

feedRouter.get('/youtube', async (c) => {
    const search = "system design ";
    // Step 1: Search YouTube using the prompt
    if (!search) {
        return c.json({
            message: "No prompt received"
        });
    }

    try {
        const youtubeSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
            search
        )}&key=${c.env.YOUTUBE_API_KEY}&maxResults=10&type=video&relevanceLanguage=en&videoEmbeddable=true`;

        const videos = await fetch(youtubeSearchUrl);
        const jsonVideos = await videos.json();
        return c.json(jsonVideos);
    } catch (error: any) {
        console.log("the erorr is ", error);
        throw new Error("Cannot fetch youtube videos", error);
    }
    //call youtube api for this   

})

feedRouter.get('/embedding', async (c) => {
    const ai = new GoogleGenAI({
        apiKey: c.env.GOOGLE_GEMINI_API_KEY
    });

    const response = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: 'What is the meaning of life?',
    });

    return c.json(response.embeddings);
})


feedRouter.get('/embeddings', async(c) => {
    //generate embeddings code will go here 
    return c.text("hello there ");
})