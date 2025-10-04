const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');

const API_KEY = "<your_api_key>";
const BASE_URL = "https://api.on-demand.io/chat/v1";

let EXTERNAL_USER_ID = "<your_external_user_id>";
const QUERY = "<your_query>";
const RESPONSE_MODE = ""; // Now dynamic
const AGENT_IDS = ["agent-1712327325","agent-1713962163","agent-1739108081","agent-1722285968","agent-1722260873","agent-1718116202","agent-1713954536","agent-1713958591","agent-1713958830","agent-1713961903","agent-1713967141"]; // Dynamic array from PluginIds
const ENDPOINT_ID = "predefined-openai-gpt4o";
const REASONING_MODE = "medium";
const FULFILLMENT_PROMPT = "";
const STOP_SEQUENCES = []; // Dynamic array
const TEMPERATURE = 0.7;
const TOP_P = 1;
const MAX_TOKENS = 0;
const PRESENCE_PENALTY = 0;
const FREQUENCY_PENALTY = 0;

async function main() {
    if (API_KEY === "<your_api_key>" || !API_KEY) {
        console.log("❌ Please set API_KEY.");
        process.exit(1);
    }
    if (EXTERNAL_USER_ID === "<your_external_user_id>" || !EXTERNAL_USER_ID) {
        EXTERNAL_USER_ID = uuidv4();
        console.log(`⚠️  Generated EXTERNAL_USER_ID: ${EXTERNAL_USER_ID}`);
    }

    const contextMetadata = [
        { key: "userId", value: "1" },
        { key: "name", value: "John" },
    ];

    const sessionId = await createChatSession();
    if (sessionId) {
        console.log("\n--- Submitting Query ---");
        console.log(`Using query: '${QUERY}'`);
        console.log(`Using responseMode: '${RESPONSE_MODE}'`);
        await submitQuery(sessionId, contextMetadata); // 👈 updated
    }
}

async function createChatSession() {
    const url = `${BASE_URL}/sessions`;

    const contextMetadata = [
        { key: "userId", value: "1" },
        { key: "name", value: "John" },
    ];

    const body = {
        agentIds: AGENT_IDS,
        externalUserId: EXTERNAL_USER_ID,
        contextMetadata: contextMetadata,
    };

    const jsonBody = JSON.stringify(body);

    console.log(`📡 Creating session with URL: ${url}`);
    console.log(`📝 Request body: ${jsonBody}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'apikey': API_KEY,
            'Content-Type': 'application/json'
        },
        body: jsonBody
    });

    if (response.status === 201) {
        const sessionRespData = await response.json();

        console.log(`✅ Chat session created. Session ID: ${sessionRespData.data.id}`);

        if (sessionRespData.data.contextMetadata.length > 0) {
            console.log("📋 Context Metadata:");
            for (const field of sessionRespData.data.contextMetadata) {
                console.log(` - ${field.key}: ${field.value}`);
            }
        }

        return sessionRespData.data.id;
    } else {
        const respBody = await response.text();
        console.log(`❌ Error creating chat session: ${response.status} - ${respBody}`);
        return "";
    }
}

async function submitQuery(sessionId, contextMetadata) {
    const url = `${BASE_URL}/sessions/${sessionId}/query`;
    const body = {
        endpointId: ENDPOINT_ID,
        query: QUERY,
        agentIds: AGENT_IDS,
        responseMode: RESPONSE_MODE,
        reasoningMode: REASONING_MODE,
        modelConfigs: {
            fulfillmentPrompt: FULFILLMENT_PROMPT,
            stopSequences: STOP_SEQUENCES,
            temperature: TEMPERATURE,
            topP: TOP_P,
            maxTokens: MAX_TOKENS,
            presencePenalty: PRESENCE_PENALTY,
            frequencyPenalty: FREQUENCY_PENALTY,
        },
    };

    const jsonBody = JSON.stringify(body);

    console.log(`🚀 Submitting query to URL: ${url}`);
    console.log(`📝 Request body: ${jsonBody}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'apikey': API_KEY,
            'Content-Type': 'application/json'
        },
        body: jsonBody
    });

    console.log();

    if (RESPONSE_MODE === "sync") {
        if (response.status === 200) {
            const original = await response.json();

            // Append context metadata at the end
            if (original.data) {
                original.data.contextMetadata = contextMetadata;
            }

            const final = JSON.stringify(original, null, 2);
            console.log("✅ Final Response (with contextMetadata appended):");
            console.log(final);
        } else {
            const respBody = await response.text();
            console.log(`❌ Error submitting sync query: ${response.status} - ${respBody}`);
        }
    } else if (RESPONSE_MODE === "stream") {
        console.log("✅ Streaming Response...");

        if (!response.body) {
            console.log("❌ No response body for streaming.");
            return;
        }

        let fullAnswer = "";
        let finalSessionId = "";
        let finalMessageId = "";
        let metrics = {};

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        async function read() {
            const { done, value } = await reader.read();
            if (done) {
                return;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith("data:")) {
                    const dataStr = line.slice(5).trim();

                    if (dataStr === "[DONE]") {
                        return;
                    }

                    try {
                        const event = JSON.parse(dataStr);
                        if (event.eventType === "fulfillment") {
                            if (event.answer) {
                                fullAnswer += event.answer;
                            }
                            if (event.sessionId) {
                                finalSessionId = event.sessionId;
                            }
                            if (event.messageId) {
                                finalMessageId = event.messageId;
                            }
                        } else if (event.eventType === "metricsLog") {
                            if (event.publicMetrics) {
                                metrics = event.publicMetrics;
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }

            await read();
        }

        await read();

        const finalResponse = {
            message: "Chat query submitted successfully",
            data: {
                sessionId: finalSessionId,
                messageId: finalMessageId,
                answer: fullAnswer,
                metrics: metrics,
                status: "completed",
                contextMetadata: contextMetadata,
            },
        };

        const formatted = JSON.stringify(finalResponse, null, 2);
        console.log("\n✅ Final Response (with contextMetadata appended):");
        console.log(formatted);
    }
}

main().catch(console.error);
