import { GoogleGenAI } from "@google/genai";

export const searchOnYt = async (searches: string[], apiKey: string ) => {

    const requests = searches.map((search) => {
        const youtubeSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
            search
        )}&key=${apiKey}&maxResults=25&type=video&relevanceLanguage=en&videoEmbeddable=true`;

        return fetch(youtubeSearchUrl)
            .then((res) => {
                
                return res.json();
            })
            .catch((error) => {
                console.log("searching went wrong" , error); 
            })
    })

    const results = await Promise.all(requests);
    
    //fetch only videos
    const videos = results.flatMap((result : any) => {
        return result.items ?? []; 
    })

    return videos;
}

const embedContent = async(results : any[] , ai : GoogleGenAI) => {
    const finalArr = await Promise.all(
        results.map(async (result: any) => {
            const embeddingResponse = await ai.models.embedContent({
                model: "text-embedding-004",
                contents:
                    result.snippet.title + " " + result.snippet.description,
            });

            const publishedAt = new Date(result.snippet.publishedAt).getTime();
            const diff = Date.now() - publishedAt;

            return {
                ...result,
                embedding: embeddingResponse.embeddings?.values,
                diff, 
            };
        })
    );
    return finalArr ; 
}