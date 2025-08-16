import { aiService } from './aiService';

export const synthesizeNoteTitle = async (
    noteText: string
): Promise<{ title: string, provenance: any }> => {
    const model = aiService.getProvider();
    const systemInstruction = "You are an expert academic synthesizer. Your task is to distill the core idea of a text into a concise, 1-3 word conceptual title. Respond ONLY with the title itself, without any extra formatting or quotation marks.";
    const prompt = `Distill the core idea of the following text into a 1-3 word conceptual title:
---
"${noteText}"
---
Title:`;

    try {
        const response = await aiService.generateContent({
            contents: prompt,
            systemInstruction
        });

        const title = response.text.trim().replace(/^["']|["']$/g, ''); // Remove quotes
        
        const { usageMetadata } = response;
        const provenance = {
            prompt,
            systemInstruction,
            rawResponse: response.text,
            model,
            inputTokens: usageMetadata?.promptTokenCount,
            outputTokens: usageMetadata?.candidatesTokenCount,
            totalTokens: usageMetadata?.totalTokenCount,
        };
        
        return { title, provenance };
    } catch (error) {
        console.error("Error synthesizing note title:", error);
        throw error;
    }
};