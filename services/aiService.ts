import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { AiSettings } from '../types';

// A unified response type
export interface AiServiceResponse {
    text: string;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
    }
}

// A unified request type that abstracts over Gemini and Groq's needs.
export interface AiServiceRequest {
    contents: string;
    systemInstruction?: string;
    responseMimeType?: 'application/json';
    responseSchema?: any;
    temperature?: number;
}

class AiService {
    private provider: 'gemini' | 'groq' = 'gemini';
    private gemini!: GoogleGenAI;
    private groqApiKey?: string;
    private groqModel?: string;

    constructor() {
        if (process.env.API_KEY) {
            this.gemini = new GoogleGenAI({ apiKey: process.env.API_KEY });
        }
    }

    public configure(settings: AiSettings) {
        this.provider = settings.provider;
        this.groqApiKey = settings.groqApiKey;
        this.groqModel = settings.groqModel || 'moonshotai/kimi-k2-instruct';
    }
    
    public getProvider(): 'gemini' | 'groq' {
        return this.provider;
    }

    public isConfigured(): boolean {
        if (this.provider === 'gemini') {
            return !!this.gemini;
        }
        if (this.provider === 'groq') {
            return !!this.groqApiKey && !!this.groqModel;
        }
        return false;
    }

    async generateContent(request: AiServiceRequest): Promise<AiServiceResponse> {
        if (!this.isConfigured()) {
            throw new Error(`AI provider '${this.provider}' is not configured.`);
        }

        if (this.provider === 'gemini') {
            return this.generateWithGemini(request);
        } else {
            return this.generateWithGroq(request);
        }
    }

    private async generateWithGemini(request: AiServiceRequest): Promise<AiServiceResponse> {
        const params: any = {
            model: 'gemini-2.5-flash',
            contents: request.contents,
        };
        
        const config: any = {};
        if (request.systemInstruction) config.systemInstruction = request.systemInstruction;
        if (request.responseMimeType) config.responseMimeType = request.responseMimeType;
        if (request.responseSchema) config.responseSchema = request.responseSchema;
        if (request.temperature) config.temperature = request.temperature;

        if (Object.keys(config).length > 0) {
            params.config = config;
        }

        const response: GenerateContentResponse = await this.gemini.models.generateContent(params);
        
        return {
            text: response.text,
            usageMetadata: response.usageMetadata ? {
                promptTokenCount: response.usageMetadata.promptTokenCount,
                candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
                totalTokenCount: response.usageMetadata.totalTokenCount,
            } : undefined
        };
    }

    private async generateWithGroq(request: AiServiceRequest): Promise<AiServiceResponse> {
        const messages: { role: 'system' | 'user', content: string }[] = [];
        if (request.systemInstruction) {
            messages.push({ role: 'system', content: request.systemInstruction });
        }
        messages.push({ role: 'user', content: request.contents });

        const body: any = {
            model: this.groqModel,
            messages,
        };

        if (request.responseMimeType === 'application/json') {
            // Groq's OpenAI-compatible API uses this format for JSON mode
            body.response_format = { type: 'json_object' };
        }
        if (request.temperature) {
            body.temperature = request.temperature;
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.groqApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Groq API error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const text = data.choices[0]?.message?.content || '';
        
        // Groq uses a different naming convention in the usage object
        return {
            text: text,
            usageMetadata: data.usage ? {
                promptTokenCount: data.usage.prompt_tokens,
                candidatesTokenCount: data.usage.completion_tokens,
                totalTokenCount: data.usage.total_tokens,
            } : undefined
        };
    }
}

// Export a singleton instance
export const aiService = new AiService();
