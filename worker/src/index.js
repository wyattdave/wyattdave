import SYSTEM_PROMPT from "../prompt.md";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ARTICLE_CONTEXT_PAGE_SIZE = 30;
const DEVTO_ARTICLES_URL = (username, page = 1, perPage = ARTICLE_CONTEXT_PAGE_SIZE) =>
    `https://dev.to/api/articles?username=${encodeURIComponent(username)}&per_page=${encodeURIComponent(perPage)}&page=${encodeURIComponent(page)}`;
const DEVTO_ARTICLE_URL = (id) =>
    `https://dev.to/api/articles/${encodeURIComponent(id)}`;

const TOOLS = [
    {
        type: "function",
        function: {
            name: "get_devto_article",
            description:
                "Fetch the full body of one of David's dev.to articles by its numeric id. Use only when the article list context is insufficient.",
            parameters: {
                type: "object",
                properties: {
                    id: {
                        type: "integer",
                        description: "The numeric dev.to article id."
                    }
                },
                required: ["id"]
            }
        }
    }
];

/* ------------------------------ CORS ------------------------------ */

const parseAllowedOrigins = (env) =>
    String(env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

const buildCorsHeaders = (request, env) => {
    const allowed = parseAllowedOrigins(env);
    const origin = request.headers.get("Origin") || "";
    const headers = {
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400"
    };
    if (origin && allowed.includes(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
    }
    return headers;
};

const json = (body, init = {}, cors = {}) =>
    new Response(JSON.stringify(body), {
        ...init,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...cors,
            ...(init.headers || {})
        }
    });

const normalizeIncomingMessage = (message) => {
    if (!message || typeof message.role !== "string") {
        return null;
    }

    if (typeof message.content !== "string") {
        return null;
    }

    const normalized = {
        role: message.role,
        content: message.content
    };

    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
        normalized.tool_calls = message.tool_calls;
    }

    if (message.role === "tool") {
        if (typeof message.tool_call_id !== "string" || typeof message.name !== "string") {
            return null;
        }

        normalized.tool_call_id = message.tool_call_id;
        normalized.name = message.name;
    }

    return normalized;
};

/* --------------------------- dev.to context ------------------------ */

let articleCache = { at: 0, data: null, username: "" };
const ARTICLE_CACHE_TTL_MS = 5 * 60 * 1000;

const trimArticleContextItem = (article) => ({
    id: article.id,
    title: article.title,
    description: article.description,
    url: article.url,
    published_at: article.published_at,
    reading_time_minutes: article.reading_time_minutes,
    tag_list: article.tag_list,
    positive_reactions_count: article.positive_reactions_count
});

const fetchArticleContext = async (username) => {
    const now = Date.now();
    if (
        articleCache.data &&
        articleCache.username === username &&
        now - articleCache.at < ARTICLE_CACHE_TTL_MS
    ) {
        return articleCache.data;
    }

    const articles = [];
    let page = 1;

    while (true) {
        const response = await fetch(DEVTO_ARTICLES_URL(username, page, ARTICLE_CONTEXT_PAGE_SIZE), {
            headers: { Accept: "application/json" }
        });
        if (!response.ok) {
            throw new Error(`dev.to list failed: ${response.status}`);
        }

        const batch = await response.json();
        const normalizedBatch = Array.isArray(batch) ? batch : [];
        if (!normalizedBatch.length) {
            break;
        }

        articles.push(...normalizedBatch.map(trimArticleContextItem));

        if (normalizedBatch.length < ARTICLE_CONTEXT_PAGE_SIZE) {
            break;
        }

        page += 1;
    }

    articleCache = { at: now, data: articles, username };
    return articles;
};

const fetchArticleById = async (id) => {
    const api_url = DEVTO_ARTICLE_URL(id);
    const response = await fetch(api_url, {
        headers: { Accept: "application/json" }
    });
    if (!response.ok) {
        const responseText = await response.text();
        return {
            id,
            api_url,
            status: response.status,
            error: `dev.to article ${id} returned ${response.status}`,
            response_headers: {
                content_type: response.headers.get("content-type"),
                server: response.headers.get("server"),
                via: response.headers.get("via"),
                x_request_id: response.headers.get("x-request-id")
            },
            response_text: responseText.slice(0, 500)
        };
    }
    const article = await response.json();
    return {
        id: article.id,
        title: article.title,
        description: article.description,
        url: article.url,
        api_url,
        tags: article.tags,
        published_at: article.published_at,
        reading_time_minutes: article.reading_time_minutes,
        body_markdown: article.body_markdown
    };
};

/* ------------------------ OpenRouter helpers ----------------------- */

const callOpenRouter = async (env, messages) => {
    if (!env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY binding is not set.");
    }

    // Secrets Store bindings expose .get(); plain secrets are strings.
    const rawKey = typeof env.OPENROUTER_API_KEY === "string"
        ? env.OPENROUTER_API_KEY
        : await env.OPENROUTER_API_KEY.get();
    const apiKey = (rawKey || "").trim();

    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY secret resolved to empty value.");
    }

    const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": env.SITE_URL || "",
            "X-Title": env.SITE_TITLE || "WyattDave Portfolio Chatbot"
        },
        body: JSON.stringify({
            model: env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
            messages,
            tools: TOOLS,
            tool_choice: "auto",
            temperature: 0.4
        })
    });

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`OpenRouter ${response.status}: ${text}`);
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`OpenRouter returned non-JSON: ${text.slice(0, 200)}`);
    }
};

/* ------------------------------ Handler ---------------------------- */

const handleChat = async (request, env, corsHeaders) => {
    let payload;
    try {
        payload = await request.json();
    } catch (error) {
        return json({ error: "Body must be JSON." }, { status: 400 }, corsHeaders);
    }

    const userMessages = Array.isArray(payload?.messages) ? payload.messages : null;
    if (!userMessages || !userMessages.length) {
        return json(
            { error: "Provide a `messages` array of { role, content }." },
            { status: 400 },
            corsHeaders
        );
    }

    const clientTools = payload?.clientTools === true;

    const username = env.DEVTO_USERNAME || "wyattdave";
    let articleContext = [];
    try {
        articleContext = await fetchArticleContext(username);
    } catch (error) {
        articleContext = [];
    }

    const systemPrompt = [
        SYSTEM_PROMPT,
        "",
        "## All dev.to articles (JSON)",
        "```json",
        JSON.stringify(articleContext, null, 2),
        "```"
    ].join("\n");

    const messages = [
        { role: "system", content: systemPrompt },
        ...userMessages
            .map(normalizeIncomingMessage)
            .filter(Boolean)
    ];

    // Tool-use loop. Cap iterations to avoid runaway calls.
    const MAX_HOPS = 3;
    for (let hop = 0; hop < MAX_HOPS; hop += 1) {
        const completion = await callOpenRouter(env, messages);
        const choice = completion?.choices?.[0];
        const message = choice?.message;

        if (!message) {
            return json(
                { error: "Model returned no message.", raw: completion },
                { status: 502 },
                corsHeaders
            );
        }

        const toolCalls = message.tool_calls || [];
        if (!toolCalls.length) {
            return json(
                {
                    reply: message.content || "",
                    model: completion.model,
                    usage: completion.usage
                },
                {},
                corsHeaders
            );
        }

        if (clientTools) {
            return json(
                {
                    assistant: {
                        role: "assistant",
                        content: message.content || "",
                        tool_calls: toolCalls
                    },
                    tool_calls: toolCalls,
                    model: completion.model,
                    usage: completion.usage
                },
                {},
                corsHeaders
            );
        }

        // Push the assistant turn that contained the tool calls, then resolve each.
        messages.push({
            role: "assistant",
            content: message.content || "",
            tool_calls: toolCalls
        });

        for (const call of toolCalls) {
            const name = call?.function?.name;
            let args = {};
            try {
                args = JSON.parse(call?.function?.arguments || "{}");
            } catch {
                args = {};
            }

            let toolResult;
            if (name === "get_devto_article" && args && args.id) {
                toolResult = await fetchArticleById(args.id);
            } else {
                toolResult = { error: `Unknown tool '${name}'.` };
            }

            messages.push({
                role: "tool",
                tool_call_id: call.id,
                name,
                content: JSON.stringify(toolResult)
            });
        }
    }

    return json(
        { error: "Tool-use loop exceeded maximum hops." },
        { status: 504 },
        corsHeaders
    );
};

export default {
    async fetch(request, env) {
        const corsHeaders = buildCorsHeaders(request, env);

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        const url = new URL(request.url);

        if (request.method === "GET" && url.pathname === "/") {
            return json(
                { name: "wyattdave-chatbot", ok: true },
                {},
                corsHeaders
            );
        }

        if (request.method === "POST" && url.pathname === "/chat") {
            try {
                return await handleChat(request, env, corsHeaders);
            } catch (error) {
                return json(
                    { error: error.message || String(error) },
                    { status: 500 },
                    corsHeaders
                );
            }
        }

        return json({ error: "Not found." }, { status: 404 }, corsHeaders);
    }
};
