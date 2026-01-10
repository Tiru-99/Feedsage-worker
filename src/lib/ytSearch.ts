
interface YouTubeApiResponse<T> {
    items?: T[];
}

interface SearchResultItem {
    id: {
        videoId: string;
    };
    snippet: {
        title: string;
        description?: string;
        publishedAt: string;
        channelId: string;
        channelTitle: string;
        thumbnails: {
            default?: { url: string };
            medium?: { url: string };
            high?: { url: string };
        };
    };
}

interface VideoDetailsItem {
    id: string;
    statistics?: {
        viewCount?: string;
    };
    contentDetails?: {
        duration?: string;
    };
}

interface ChannelDetailsItem {
    id: string;
    snippet?: {
        thumbnails?: {
            default?: { url: string };
            medium?: { url: string };
            high?: { url: string };
        };
    };
}

/* ---------------- Helpers ---------------- */

const chunk = <T>(arr: T[], size: number): T[][] => {
    const res: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        res.push(arr.slice(i, i + size));
    }
    return res;
};

const parseISODuration = (duration = "PT0S"): string => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

    const h = Number(match?.[1] ?? 0);
    const m = Number(match?.[2] ?? 0);
    const s = Number(match?.[3] ?? 0);

    if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    return `${m}:${String(s).padStart(2, "0")}`;
};

const isoDurationToSeconds = (duration = "PT0S"): number => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const h = Number(match?.[1] ?? 0);
    const m = Number(match?.[2] ?? 0);
    const s = Number(match?.[3] ?? 0);
    return h * 3600 + m * 60 + s;
};

/* ---------------- Main Function ---------------- */

export const searchOnYt = async (
    searches: string[],
    apiKey: string
): Promise<
    (SearchResultItem & {
        views: string;
        duration: string;
        channelAvatarUrl: string;
    })[]
> => {

    const searchRequests = searches.map((query) => {
        const url =
            `https://www.googleapis.com/youtube/v3/search?` +
            new URLSearchParams({
                part: "snippet",
                q: query,
                key: apiKey,
                maxResults: "25",
                type: "video",
                relevanceLanguage: "en",
                videoEmbeddable: "true",
            });

        return fetch(url)
            .then(async (res) => {
                const data = (await res.json()) as YouTubeApiResponse<SearchResultItem>;
                return data.items ?? [];
            })
            .catch(() => []);
    });

    const searchResults = await Promise.all(searchRequests);
    const videos = searchResults.flat();

    if (!videos.length) return [];

    //extract ids 
    const videoIds = [...new Set(videos.map((v) => v.id.videoId))];
    const channelIds = [...new Set(videos.map((v) => v.snippet.channelId))];

    //build video details map 
    const videoDetailsMap = new Map<string, VideoDetailsItem>();

    for (const batch of chunk(videoIds, 50)) {
        const url =
            `https://www.googleapis.com/youtube/v3/videos?` +
            new URLSearchParams({
                part: "contentDetails,statistics",
                id: batch.join(","),
                key: apiKey,
            });

        const res = await fetch(url);
        const data = (await res.json()) as YouTubeApiResponse<VideoDetailsItem>;

        for (const item of data.items ?? []) {
            videoDetailsMap.set(item.id, item);
        }
    }

    //build channel details map
    const channelDetailsMap = new Map<string, ChannelDetailsItem>();

    for (const batch of chunk(channelIds, 50)) {
        const url =
            `https://www.googleapis.com/youtube/v3/channels?` +
            new URLSearchParams({
                part: "snippet",
                id: batch.join(","),
                key: apiKey,
            });

        const res = await fetch(url);
        const data = (await res.json()) as YouTubeApiResponse<ChannelDetailsItem>;

        for (const item of data.items ?? []) {
            channelDetailsMap.set(item.id, item);
        }
    }


    const enrichedVideos = videos
        .map((video) => {
            const videoId = video.id.videoId;
            const channelId = video.snippet.channelId;

            const videoDetails = videoDetailsMap.get(videoId);
            const channelDetails = channelDetailsMap.get(channelId);

            const isoDuration = videoDetails?.contentDetails?.duration ?? "PT0S";
            const durationSeconds = isoDurationToSeconds(isoDuration);

            //filter shorts
            if (durationSeconds <= 60) return null;

            return {
                ...video,
                views: videoDetails?.statistics?.viewCount ?? "0",
                duration: parseISODuration(isoDuration),
                channelAvatarUrl:
                    channelDetails?.snippet?.thumbnails?.default?.url ?? "",
            };
        })
        .filter(
            (
                v
            ): v is SearchResultItem & {
                views: string;
                duration: string;
                channelAvatarUrl: string;
            } => v !== null
        );

    return enrichedVideos;
};
