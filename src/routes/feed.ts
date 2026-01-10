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
  const userPrompt = c.req.query("prompt");
  const apiKey = c.req.query("apiKey");

  if (!userPrompt || !apiKey) {
    return c.json(
      { success: false, message: "Either prompt or user key is missing" },
      400
    );
  }

  try {
    if (!ai) {
      ai = createAiInstance(c.env.GOOGLE_GEMINI_API_KEY);
    }

    const aiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt.replace("<USER_PROMPT>", userPrompt),
    });

    let searchQueries: string[];
    try {
      searchQueries = JSON.parse(aiResponse.text ?? "[]");
    } catch {
      return c.json(
        { success: false, message: "Invalid AI response format" },
        500
      );
    }

    if (!Array.isArray(searchQueries) || searchQueries.length === 0) {
      return c.json(
        { success: false, message: "No search queries generated" },
        500
      );
    }


    const rawVideos = await searchOnYt(searchQueries, apiKey);

    if (!rawVideos.length) {
      return c.json({
        success: true,
        message: "No videos found",
        feed: [],
        topFeed: [],
      });
    }

    //deduplication , searches may have similar videos
    const uniqueVideosMap = new Map<string, any>();

    for (const video of rawVideos) {
      const videoId = video.id?.videoId;
      if (!videoId) continue;

      if (!uniqueVideosMap.has(videoId)) {
        uniqueVideosMap.set(videoId, video);
      }
    }

    const videos = Array.from(uniqueVideosMap.values());


    const videoTexts = videos.map(
      (v) => `${v.snippet.title} ${v.snippet.description ?? ""}`
    );

    const embeddings = await c.env.AI.run(
      "@cf/qwen/qwen3-embedding-0.6b",
      { text: [userPrompt, ...videoTexts] }
    );

    const userVector = embeddings.data?.[0];
    if (!userVector) {
      throw new Error("User embedding generation failed");
    }


    const SEMANTIC_WEIGHT = 0.7;
    const RECENCY_WEIGHT = 0.3;
    const RECENCY_DECAY_DAYS = 30;
    const TOP_K = 35;
    const now = Date.now();

    const videosWithScores = videos
      .map((video, index) => {
        const videoVector = embeddings.data?.[index + 1];
        if (!videoVector) return null;

        const semanticScore = cosineSimilarity(userVector, videoVector);

        const publishedAt = new Date(video.snippet.publishedAt).getTime();
        const daysOld = (now - publishedAt) / (1000 * 60 * 60 * 24);
        const recencyScore = Math.exp(-daysOld / RECENCY_DECAY_DAYS);

        const finalScore =
          semanticScore * SEMANTIC_WEIGHT +
          recencyScore * RECENCY_WEIGHT;

        return {
          ...video,
          semanticScore,
          recencyScore,
          finalScore,
        };
      })
      .filter(Boolean);

    const topFeed = [...videosWithScores]
      .sort((a, b) => b!.finalScore - a!.finalScore)
      .slice(0, TOP_K);


    return c.json({
      success: true,
      message: "Feed generated successfully",
      feed: videosWithScores,
      topFeed,
    });
  } catch (error) {
    console.error("[FEED_ERROR]", error);

    return c.json(
      {
        success: false,
        message: "Failed to generate feed",
        feed: [],
        topFeed: [],
      },
      500
    );
  }
});




feedRouter.post("/embedding", async (c) => {
    const { title, description } = await c.req.json();
    if (!title || !description) {
        return c.json({
            message: "Incomplete details sent",
            success: false,
            embeddings: []
        }, 400)
    }
    try {
        const embeddings = await c.env.AI.run('@cf/qwen/qwen3-embedding-0.6b', {
            text: `${title} ${description}`
        });

        if (!embeddings) {
            return c.json({
                message: "Embeddings not generated , something went wrong",
                success: false,
                embeddings: []
            }, 500)
        }
        return c.json({
            message: "Embeddings received successfully",
            embeddings,
            success: true
        }, 200);

    } catch (error) {
        return c.json({
            message: "Something went wrong while getting embeddings",
            success: false,
            embeddings: []
        }, 500)
    }
})

feedRouter.get('/score/:search/:prompt', async (c) => {
    const { search, prompt } = c.req.param();

    try {
        const embeddings = await c.env.AI.run('@cf/qwen/qwen3-embedding-0.6b', {
            text: [search, prompt]
        });

        const seachVector = embeddings.data?.[0];
        const promptVector = embeddings.data?.[0];

        if (!seachVector || !promptVector) {
            return c.json({
                message: "No vectors found !",
                score: null,
                success: false
            }, 500)
        }

        const semanticScore = cosineSimilarity(seachVector, promptVector);

        return c.json({
            message: "Successfully fetched the score",
            score: semanticScore,
            success: true
        }, 200);
    } catch (error) {
        console.log("Something went wrong while fetching score", error);
        return c.json({
            message: "Internal server error while calculating score",
            score: null,
            success: false
        }, 500)
    }
})