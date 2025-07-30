
import { useState, useCallback } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import * as citationService from '../../../services/citationService';
import type { MapNode, MapLink, Citation, FormalizationResult, LogicalConstruct, DefinitionAnalysisState, DefinitionResult, CounterExampleResult } from '../../../types';
import { MapBuilderProps, LogicalWorkbenchState, KeyVoice, Counterargument, AnalysisResult } from '../types';
import { getMidpoint } from '../utils/calculations';
import * as nebulaService from '../../../services/nebulaService';

interface UseMapAIProps extends Pick<MapBuilderProps, 'layout' | 'setLayout' | 'logActivity'> {
    ai: GoogleGenAI;
    nodeMap: Map<string | number, MapNode>;
    clearSelections: () => void;
}

export const useMapAI = ({ ai, layout, setLayout, logActivity, nodeMap, clearSelections }: UseMapAIProps) => {
    const { nodes, links } = layout;

    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [isAnalyzingGenealogy, setIsAnalyzingGenealogy] = useState<string | number | null>(null);
    const [isAnalyzingArgument, setIsAnalyzingArgument] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isFormalizing, setIsFormalizing] = useState(false);
    const [formalizationResult, setFormalizationResult] = useState<FormalizationResult | null>(null);
    const [selectedFormalizationIndex, setSelectedFormalizationIndex] = useState(0);
    const [definitionAnalysisState, setDefinitionAnalysisState] = useState<DefinitionAnalysisState | null>(null);

    const generateJustification = useCallback(async (link: MapLink) => {
        const sourceNode = nodeMap.get(link.source);
        const targetNode = nodeMap.get(link.target);
        if (!sourceNode || !targetNode) return;

        setLayout(prev => ({ ...prev, links: prev.links.map(l => (l.source === link.source && l.target === link.target) ? { ...l, justificationState: 'loading' } : l) }));

        const model = 'gemini-2.5-flash';
        const systemInstruction = 'You are a philosophy expert. Your explanations must be directly grounded in the provided source texts. You must cite your claims. Respond ONLY with a JSON object.';
        
        const relevantArticles = citationService.findRelevantArticles([sourceNode.name, targetNode.name]);
        const contextString = relevantArticles.length > 0
            ? `Source Texts:\n${relevantArticles.map(a => `ID: ${a.id}, Title: "${a.title}"`).join('\n')}`
            : "No specific source texts provided. Rely on your general knowledge.";

        const prompt = `A user has defined a connection between "${sourceNode.name}" and "${targetNode.name}" with the relationship type(s) "${link.relationshipTypes.join(', ')}".
        ${contextString}
        Based *only* on the provided source texts, generate a concise, one-sentence justification for this connection.
        Then, provide up to two citations from the source texts that support your justification. For each citation, include the source ID and a short, relevant quoted phrase or close paraphrase from the text.
        If no relevant sources are provided or you cannot ground the justification in them, generate a justification from general knowledge and return an empty citations array.`;

        try {
            const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            justificationText: { type: Type.STRING },
                            citations: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        sourceId: { type: Type.STRING },
                                        citedText: { type: Type.STRING }
                                    },
                                    required: ["sourceId", "citedText"]
                                }
                            }
                        },
                        required: ["justificationText", "citations"]
                    }
                }
            });

            const result = JSON.parse(response.text);
            if (!result.justificationText) throw new Error("Empty justification from AI.");

            const fullCitations: Citation[] = result.citations.map((c: any) => {
                const article = citationService.getArticleById(c.sourceId);
                return {
                    ...c,
                    sourceTitle: article?.title || 'Unknown Source',
                    source: article?.source || 'N/A',
                    url: article?.url || '#'
                };
            }).filter((c: Citation) => c.citedText && c.sourceId);

            const newJustification = {
                text: result.justificationText,
                citations: fullCitations,
            };

            logActivity('GENERATE_JUSTIFICATION', {
                sourceName: sourceNode.name,
                targetName: targetNode.name,
                relationships: link.relationshipTypes,
                justification: newJustification,
                provenance: { prompt, systemInstruction, rawResponse: response.text, model }
            });

            setLayout(prev => ({ ...prev, links: prev.links.map(l => (l.source === link.source && l.target === link.target) ? { ...l, justificationState: 'success', justification: newJustification } : l) }));

        } catch (error) {
            console.error("Error generating justification:", error);
            const errorJustification = { text: 'Failed to generate justification.', citations: [] };
             setLayout(prev => ({ ...prev, links: prev.links.map(l => (l.source === link.source && l.target === link.target) ? { ...l, justificationState: 'error', justification: errorJustification } : l) }));
        }
    }, [ai, nodeMap, setLayout, logActivity]);

    const handleSynthesizeRegion = useCallback(async (regionSelectedNodeIds: Set<string|number>) => {
        if (regionSelectedNodeIds.size < 2 || isSynthesizing) return;

        setIsSynthesizing(true);
        const selectedNodes = Array.from(regionSelectedNodeIds).map(id => nodeMap.get(id)).filter((n): n is MapNode => !!n);
        const selectedLinks = links.filter(l => regionSelectedNodeIds.has(l.source) && regionSelectedNodeIds.has(l.target));

        const model = 'gemini-2.5-flash';
        const systemInstruction = "You are an expert philosophical analyst and synthesizer. Your primary task is to judge the coherence of a set of concepts. If they are coherent, your secondary task is to synthesize a new concept from them. Respond ONLY with a JSON object matching the specified schema.";
        const prompt = `
        You will be given a cluster of philosophical concepts. First, assess if these concepts are conceptually coherent enough to form a meaningful, non-trivial higher-order philosophical theme. They are not coherent if they are too disparate (e.g., 'Free Will', 'Photosynthesis', 'Jazz').

        Then, if and only if they are coherent, synthesize a single, overarching theme or emergent concept that they collectively represent.

        Concepts in the cluster:
        - ${selectedNodes.map(n => n.name).join('\n- ')}

        User-defined connections within the cluster:
        ${selectedLinks.length > 0 ? selectedLinks.map(l => `- A ${l.relationshipTypes.join(', ')} link between "${nodeMap.get(l.source)?.name}" and "${nodeMap.get(l.target)?.name}"`).join('\n') : "- None"}

        Respond with a JSON object.
        - If not coherent, the object must contain 'isCoherent: false' and a 'coherenceJustification'.
        - If coherent, the object must contain 'isCoherent: true', 'coherenceJustification', 'emergentConceptName', 'synthesis', and 'reasoning'.
        `;

        try {
            const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            isCoherent: { type: Type.BOOLEAN, description: "Whether the concepts form a meaningful philosophical cluster." },
                            coherenceJustification: { type: Type.STRING, description: "A brief explanation of why the cluster is or is not coherent." },
                            emergentConceptName: { type: Type.STRING, description: "Optional: A concise name for the new, synthesized concept (3-5 words max)." },
                            synthesis: { type: Type.STRING, description: "Optional: A one-paragraph explanation of the emergent concept." },
                            reasoning: { type: Type.STRING, description: "Optional: A short, bulleted markdown list explaining how the provided concepts and links support the synthesis." }
                        },
                        required: ["isCoherent", "coherenceJustification"]
                    }
                }
            });

            const result = JSON.parse(response.text);

            if (!result.isCoherent) {
                alert(`Synthesis Failed: ${result.coherenceJustification}`);
                clearSelections();
            } else {
                const { emergentConceptName, synthesis, reasoning } = result;
                if (!emergentConceptName || !synthesis || !reasoning) {
                    throw new Error("AI deemed concepts coherent but did not provide all required fields for synthesis.");
                }

                const centerX = selectedNodes.reduce((acc, n) => acc + n.x, 0) / selectedNodes.length;
                const centerY = selectedNodes.reduce((acc, n) => acc + n.y, 0) / selectedNodes.length;
                const newId = `synth_${Date.now()}`;

                const newNode: MapNode = {
                    id: newId,
                    name: emergentConceptName,
                    x: centerX,
                    y: centerY,
                    shape: 'rect',
                    width: 180,
                    height: 50,
                    isAiGenerated: true,
                    synthesisInfo: { synthesis, reasoning }
                };

                const newLinks: MapLink[] = selectedNodes.map(n => ({
                    source: newId,
                    target: n.id,
                    pathStyle: 'curved',
                    relationshipTypes: ['Synthesizes']
                }));
                
                logActivity('SYNTHESIZE_REGION', {
                    newConceptName: emergentConceptName,
                    sourceConceptCount: selectedNodes.length,
                    provenance: {
                        prompt: `Synthesize a theme from the following concepts: ${selectedNodes.map(n => n.name).join(', ')}`,
                        systemInstruction,
                        rawResponse: response.text,
                        model
                    }
                });
                
                setLayout(prev => ({
                    ...prev,
                    nodes: [...prev.nodes, newNode],
                    links: [...prev.links, ...newLinks]
                }));

                clearSelections();
            }

        } catch (error) {
            console.error("Error synthesizing region:", error);
            alert("The AI failed to analyze the concept cluster. This could be a network issue or an unexpected response format. Please try again.");
        } finally {
            setIsSynthesizing(false);
        }
    }, [isSynthesizing, nodeMap, links, ai, setLayout, clearSelections, logActivity]);

    const handleExploreImplications = useCallback(async (link: MapLink) => {
        const sourceNode = nodeMap.get(link.source);
        const targetNode = nodeMap.get(link.target);
        if (!sourceNode || !targetNode || link.implicationsState === 'loading') return;
        
        setLayout(prev => ({
            ...prev,
            links: prev.links.map(l => (l.source === link.source && l.target === link.target) ? {...l, implicationsState: 'loading'} : l)
        }));
        
        const model = 'gemini-2.5-flash';
        const systemInstruction = "You are a creative philosophical research assistant. Your task is to brainstorm provocative questions based on user-provided connections. Respond only with a JSON array of strings.";
        const prompt = `A user has created a philosophical link between "${sourceNode.name}" and "${targetNode.name}", labeling the connection as: ${link.relationshipTypes.join(', ')}.
        Based on this user-defined connection, generate exactly three interesting, non-obvious, and open-ended philosophical questions or research avenues that this link might inspire.
        The questions should be distinct and encourage deeper inquiry.
        Respond ONLY with a JSON array of three strings.`;

        try {
            const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                }
            });
            
            logActivity('EXPLORE_IMPLICATIONS', {
                sourceName: sourceNode.name,
                targetName: targetNode.name,
                relationships: link.relationshipTypes,
                provenance: {
                    prompt,
                    systemInstruction,
                    rawResponse: response.text,
                    model
                }
            });

            const questions = JSON.parse(response.text);
            if (!Array.isArray(questions) || questions.length === 0) {
                throw new Error("AI returned no questions.");
            }
             setLayout(prev => ({
                ...prev,
                links: prev.links.map(l => (l.source === link.source && l.target === link.target) ? {...l, implicationsState: 'success', implications: questions} : l)
            }));
        } catch (error) {
            console.error("Error exploring implications:", error);
            setLayout(prev => ({
                ...prev,
                links: prev.links.map(l => (l.source === link.source && l.target === link.target) ? {...l, implicationsState: 'error', implications: ["The AI could not generate implications for this link."]} : l)
            }));
        }

    }, [nodeMap, ai, logActivity, setLayout]);

    const handleAnalyzeGenealogy = useCallback(async (nodeId: number | string) => {
        const sourceNode = nodeMap.get(nodeId);
        if (!sourceNode || isAnalyzingGenealogy) return;

        setIsAnalyzingGenealogy(nodeId);
        
        const model = 'gemini-2.5-flash';
        const systemInstruction = "You are an expert in the history of philosophy. Your task is to identify key historical figures and concepts related to a given philosophical topic. Provide factual, verifiable information. Respond with JSON.";
        const prompt = `For the philosophical concept "${sourceNode.name}", identify up to 3 key historical precursors (concepts or figures that came before and influenced it) and up to 3 key figures who significantly developed or critiqued it after its formulation. For each entry, provide the name and a one-sentence summary of their contribution or connection. Respond ONLY with a JSON object.`;

        try {
            const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            precursors: {
                                type: Type.ARRAY,
                                description: "Historical figures or concepts that came before and influenced the topic.",
                                items: {
                                    type: Type.OBJECT,
                                    properties: { name: { type: Type.STRING }, summary: { type: Type.STRING } },
                                    required: ["name", "summary"]
                                }
                            },
                            successors: {
                                type: Type.ARRAY,
                                description: "Key figures who significantly developed or critiqued the topic.",
                                items: {
                                    type: Type.OBJECT,
                                    properties: { name: { type: Type.STRING }, summary: { type: Type.STRING } },
                                    required: ["name", "summary"]
                                }
                            }
                        },
                        required: ["precursors", "successors"]
                    }
                }
            });
            
            logActivity('ANALYZE_GENEALOGY', {
                conceptName: sourceNode.name,
                conceptId: sourceNode.id,
                provenance: {
                    prompt,
                    systemInstruction,
                    rawResponse: response.text,
                    model
                }
            });

            const result = JSON.parse(response.text);
            const { precursors, successors } = result;

            const newNodes: MapNode[] = [];
            const newLinks: MapLink[] = [];
            const allNewEntries = [...precursors, ...successors];
            const radius = 150;
            const angleStep = (2 * Math.PI) / allNewEntries.length;

            allNewEntries.forEach((entry, index) => {
                const angle = angleStep * index;
                const newId = `hist_${nodeId}_${entry.name.replace(/\s+/g, '_')}`;
                
                if (nodeMap.has(newId) || nodes.some(n => n.id === newId)) return;

                const newNode: MapNode = {
                    id: newId,
                    name: entry.name,
                    x: sourceNode.x + radius * Math.cos(angle),
                    y: sourceNode.y + radius * Math.sin(angle),
                    shape: 'circle',
                    width: 80,
                    height: 80,
                    isHistorical: true,
                    synthesisInfo: { synthesis: entry.summary, reasoning: '' }
                };
                newNodes.push(newNode);

                const isPrecursor = precursors.includes(entry);
                newLinks.push({
                    source: isPrecursor ? newId : sourceNode.id,
                    target: isPrecursor ? sourceNode.id : newId,
                    pathStyle: 'curved',
                    relationshipTypes: ['Contextual'],
                    isHistorical: true,
                });
            });

            setLayout(prev => ({
                ...prev,
                nodes: [...prev.nodes, ...newNodes],
                links: [...prev.links, ...newLinks]
            }));

        } catch (error) {
            console.error("Error analyzing genealogy:", error);
            alert("The AI failed to analyze the concept's genealogy. Please try again.");
        } finally {
            setIsAnalyzingGenealogy(null);
        }
    }, [nodeMap, isAnalyzingGenealogy, logActivity, ai, setLayout, nodes]);

    const handleAnalyzeArgument = useCallback(async (link: MapLink) => {
        const sourceNode = nodeMap.get(link.source);
        const targetNode = nodeMap.get(link.target);
        if (!sourceNode || !targetNode || isAnalyzingArgument) return;
        
        setIsAnalyzingArgument(true);
        setAnalysisResult(null);

        const model = 'gemini-2.5-flash';
        const systemInstruction = "You are a philosophical analyst. Your task is to provide structured dialectical analysis of user-defined arguments. Adhere strictly to the JSON output format.";
        const prompt = `A philosophical argument is defined by a link: "${sourceNode.name}" is connected to "${targetNode.name}" with the relationship type(s) "${link.relationshipTypes.join(', ')}".
        Your task is to perform a dialectical analysis of this argument.
        1. **Counterarguments**: Generate up to 3 common or powerful abstract counterarguments. For each, provide a short, memorable title (3-5 words max) and a one-sentence description.
        2. **Key Voices**: Identify up to 2 historical or contemporary philosophers who would likely support this argument (Proponents) and up to 2 who would likely oppose it (Opponents). For each philosopher, provide a one-sentence explanation of their relevance.
        Respond ONLY with a JSON object.`;

        try {
            const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            counterarguments: {
                                type: Type.ARRAY,
                                description: "Abstract counterarguments against the user's defined link, each with a title and description.",
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING, description: "A short, 3-5 word title for the counterargument." },
                                        description: { type: Type.STRING, description: "A one-sentence description of the counterargument." }
                                    },
                                    required: ["title", "description"]
                                }
                            },
                            keyVoices: {
                                type: Type.OBJECT,
                                description: "Key philosophical figures relevant to the argument.",
                                properties: {
                                    proponents: {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.OBJECT,
                                            properties: { name: { type: Type.STRING }, relevance: { type: Type.STRING } },
                                            required: ["name", "relevance"]
                                        }
                                    },
                                    opponents: {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.OBJECT,
                                            properties: { name: { type: Type.STRING }, relevance: { type: Type.STRING } },
                                            required: ["name", "relevance"]
                                        }
                                    }
                                }
                            }
                        },
                        required: ["counterarguments", "keyVoices"]
                    }
                }
            });
            
            logActivity('ANALYZE_ARGUMENT', {
                sourceName: sourceNode.name,
                targetName: targetNode.name,
                relationships: link.relationshipTypes,
                provenance: {
                    prompt,
                    systemInstruction,
                    rawResponse: response.text,
                    model
                }
            });

            const result = JSON.parse(response.text);
            setAnalysisResult(result);

        } catch (error) {
            console.error("Error analyzing argument:", error);
            alert("The Dialectic Engine failed to produce an analysis. This could be due to a network issue or an unusual argument structure.");
        } finally {
            setIsAnalyzingArgument(false);
        }
    }, [ai, isAnalyzingArgument, logActivity, nodeMap]);

    const handleAddDialecticNode = useCallback((item: Counterargument | KeyVoice, type: 'counter' | 'proponent' | 'opponent', dialecticAnalysisLink: MapLink) => {
        const sourceNode = nodeMap.get(dialecticAnalysisLink.source);
        const targetNode = nodeMap.get(dialecticAnalysisLink.target);
        if (!sourceNode || !targetNode) return;

        const midPoint = getMidpoint(dialecticAnalysisLink, nodeMap);
        const newId = `dialectic_${Date.now()}`;
        let newNode: MapNode;
        let newLink: MapLink;

        if (type === 'counter') {
            const counter = item as Counterargument;
            newNode = {
                id: newId,
                name: counter.title,
                x: midPoint.x,
                y: midPoint.y + 80,
                shape: 'rect',
                width: 160,
                height: 40,
                isDialectic: true,
                synthesisInfo: {
                    synthesis: counter.description,
                    reasoning: "AI-generated counterargument."
                }
            };
            newLink = {
                source: newId, target: dialecticAnalysisLink.target, pathStyle: 'curved', relationshipTypes: ['Oppositional']
            };
        } else {
            const voice = item as KeyVoice;
            const isProponent = type === 'proponent';
            const anchorNode = isProponent ? sourceNode : targetNode;
            newNode = {
                id: newId,
                name: voice.name,
                x: anchorNode.x + (isProponent ? -80 : 80),
                y: anchorNode.y + 80,
                shape: 'circle',
                width: 80,
                height: 80,
                isDialectic: true,
                synthesisInfo: {
                    synthesis: voice.relevance,
                    reasoning: ""
                }
            };
            newLink = {
                source: newId, target: anchorNode.id, pathStyle: 'curved', relationshipTypes: [isProponent ? 'Supportive' : 'Oppositional']
            };
        }

        setLayout(prev => ({
            ...prev,
            nodes: [...prev.nodes, newNode],
            links: [...prev.links, newLink]
        }));
    }, [nodeMap, setLayout]);
    
    const handleFormalizeArgument = useCallback(async (workbenchState: LogicalWorkbenchState) => {
        setIsFormalizing(true);
        setFormalizationResult(null);
        setSelectedFormalizationIndex(0);

        let logPayloadBase: any;
        let prompt: string;
        
        const model = 'gemini-2.5-flash';
        const systemInstruction = "You are a logician and philosophical analyst. Your task is to deconstruct arguments into their formal components, offering multiple valid interpretations. Adhere strictly to the requested JSON output format.";

        if (workbenchState.link) {
            const { link } = workbenchState;
            const sourceNode = nodeMap.get(link.source);
            const targetNode = nodeMap.get(link.target);
            if (!sourceNode || !targetNode) { setIsFormalizing(false); return; }

            logPayloadBase = {
                sourceName: sourceNode.name,
                targetName: targetNode.name,
                relationships: link.relationshipTypes,
            };
            prompt = `A philosophical argument is defined by a connection from a premise ("${sourceNode.name}") to a conclusion ("${targetNode.name}"). The nature of this connection is described as: "${link.relationshipTypes.join(', ')}".`;

            setLayout(prev => ({
                ...prev,
                links: prev.links.map(l => (l.source === link.source && l.target === link.target) ? { ...l, formalizationState: 'loading' } : l)
            }));
        } else { // Combined argument
            const { premises, conclusion } = workbenchState.combinedArgument!;
            logPayloadBase = {
                premiseNames: premises.map(p => p.name),
                conclusionName: conclusion.name,
            };
            prompt = `A philosophical argument is defined by a set of premises leading to a conclusion.
            Premises: ${JSON.stringify(premises.map(p => p.name))}
            Conclusion: "${conclusion.name}"`;
        }

        const fullPrompt = `${prompt}
        Your task is to analyze this argument's logical structure.
        Provide your analysis in a structured JSON format.
        1.  **Propositions**: Identify the distinct propositions and assign them variables (P, Q, R, etc.).
        2.  **Formalization Choices**: Generate up to 3 distinct formalizations. For each, provide 'formalRepresentation', 'suggestedSystem', and a 'rationale' explaining why this formalization is appropriate.
        3.  **Overall Critique**: Provide a single, brief, neutral critique of the argument's general logical structure.
        Respond ONLY with a JSON object that strictly follows the specified schema.`;

        try {
            const response = await ai.models.generateContent({
                model,
                contents: fullPrompt,
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            propositions: {
                                type: Type.ARRAY,
                                description: "An array of objects, each mapping a propositional variable to its natural language meaning.",
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        variable: { type: Type.STRING, description: "The propositional variable (e.g., 'P')." },
                                        meaning: { type: Type.STRING, description: "The natural language proposition." }
                                    },
                                    required: ["variable", "meaning"]
                                }
                            },
                            choices: {
                                type: Type.ARRAY,
                                description: "An array of distinct formalization options for the argument.",
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        formalRepresentation: { type: Type.STRING },
                                        suggestedSystem: { type: Type.STRING },
                                        rationale: { type: Type.STRING }
                                    },
                                    required: ["formalRepresentation", "suggestedSystem", "rationale"]
                                }
                            },
                            critique: {
                                type: Type.STRING,
                                description: "A single, overarching analysis of the argument's logical structure."
                            }
                        },
                        required: ["propositions", "choices", "critique"]
                    }
                }
            });
            
            logActivity('FORMALIZE_ARGUMENT', {
                ...logPayloadBase,
                provenance: {
                    prompt: fullPrompt,
                    systemInstruction,
                    rawResponse: response.text,
                    model
                }
            });

            const result = JSON.parse(response.text) as FormalizationResult;
            setFormalizationResult(result);
            
            if (workbenchState.link) {
                 setLayout(prev => ({
                    ...prev,
                    links: prev.links.map(l => (l.source === workbenchState.link!.source && l.target === workbenchState.link!.target) ? { ...l, formalizationState: 'success', formalRepresentation: result.choices[0].formalRepresentation } : l)
                }));
            }
        } catch (error) {
            console.error("Error formalizing argument:", error);
            alert("The Logical Workbench failed to produce an analysis. This could be due to a network issue or an unusual argument structure.");
            if (workbenchState.link) {
                 setLayout(prev => ({
                    ...prev,
                    links: prev.links.map(l => (l.source === workbenchState.link!.source && l.target === workbenchState.link!.target) ? { ...l, formalizationState: 'error' } : l)
                }));
            }
        } finally {
            setIsFormalizing(false);
        }
    }, [ai, logActivity, nodeMap, setLayout]);
    
    const handleAnalyzeDefinition = useCallback(async (link: MapLink, x: number, y: number) => {
        const sourceNode = nodeMap.get(link.source);
        const targetNode = nodeMap.get(link.target);
        if (!sourceNode || !targetNode) return;
    
        clearSelections();
    
        setDefinitionAnalysisState({
            x, y, link,
            sourceNodeName: sourceNode.name,
            targetNodeName: targetNode.name,
            loadingState: 'loadingDefinitions',
            definitions: [],
            counterExamples: new Map(),
            error: null,
        });
    
        try {
            const { rawResponse, data: definitions, systemInstruction, prompt, model } = await nebulaService.fetchDefinitions(ai, sourceNode.name);
            
            logActivity('ANALYZE_DEFINITION', {
                conceptName: sourceNode.name,
                provenance: { prompt, systemInstruction, rawResponse, model }
            });
    
            setDefinitionAnalysisState(prev => prev ? { ...prev, loadingState: 'idle', definitions } : null);
        } catch (error) {
            console.error("Error fetching definitions:", error);
            setDefinitionAnalysisState(prev => prev ? { ...prev, loadingState: 'idle', error: "Failed to fetch definitions from AI." } : null);
        }
    }, [ai, nodeMap, clearSelections, logActivity]);
    
    const handleHuntForCounterExamples = useCallback(async (definition: DefinitionResult) => {
        if (!definitionAnalysisState) return;
        const { link, sourceNodeName, targetNodeName } = definitionAnalysisState;
    
        setDefinitionAnalysisState(prev => {
            if (!prev) return null;
            const newCounterExamples = new Map(prev.counterExamples);
            newCounterExamples.set(definition, []); // Set empty array to indicate loading
            return { ...prev, loadingState: 'loadingCounterExamples', counterExamples: newCounterExamples, error: null };
        });
    
        try {
            const { data: counterExamples } = await nebulaService.fetchCounterExamples(ai, sourceNodeName, targetNodeName, definition);
            
            setDefinitionAnalysisState(prev => {
                if (!prev) return null;
                const newCounterExamples = new Map(prev.counterExamples);
                newCounterExamples.set(definition, counterExamples);
                return { ...prev, loadingState: 'idle', counterExamples: newCounterExamples };
            });
    
        } catch (error) {
            console.error("Error fetching counter-examples:", error);
             setDefinitionAnalysisState(prev => {
                if (!prev) return null;
                const newCounterExamples = new Map(prev.counterExamples);
                newCounterExamples.delete(definition); // Remove loading state
                return { ...prev, loadingState: 'idle', error: `Failed to fetch counter-examples for "${definition.source}".`, counterExamples: newCounterExamples };
            });
        }
    }, [ai, definitionAnalysisState]);
    
    const handleAddCounterExampleNode = useCallback((item: CounterExampleResult, definition: DefinitionResult) => {
        if (!definitionAnalysisState) return;
        const targetNode = nodeMap.get(definitionAnalysisState.link.target);
        if (!targetNode) return;
    
        const newId = `counter_${Date.now()}`;
        const newNode: MapNode = {
            id: newId,
            name: item.counterExample,
            x: targetNode.x + 80,
            y: targetNode.y + 80,
            shape: 'rect',
            width: 160,
            height: 40,
            isCounterExample: true,
            synthesisInfo: {
                synthesis: `Counter-example to the claim that "${definitionAnalysisState.targetNodeName}" is a type of "${definitionAnalysisState.sourceNodeName}" under the definition from ${definition.source}.`,
                reasoning: item.justification
            }
        };
    
        const newLink: MapLink = {
            source: newId,
            target: targetNode.id,
            pathStyle: 'curved',
            relationshipTypes: ['Refutes'],
            isCounterExampleLink: true,
        };
    
        setLayout(prev => ({
            ...prev,
            nodes: [...prev.nodes, newNode],
            links: [...prev.links, newLink]
        }));
    }, [definitionAnalysisState, nodeMap, setLayout]);

    return {
        isSynthesizing,
        isAnalyzingGenealogy,
        isAnalyzingArgument,
        analysisResult,
        isFormalizing,
        formalizationResult,
        selectedFormalizationIndex,
        setSelectedFormalizationIndex,
        definitionAnalysisState,
        setDefinitionAnalysisState,
        generateJustification,
        handleSynthesizeRegion,
        handleExploreImplications,
        handleAnalyzeGenealogy,
        handleAnalyzeArgument,
        handleAddDialecticNode,
        handleFormalizeArgument,
        handleAnalyzeDefinition,
        handleHuntForCounterExamples,
        handleAddCounterExampleNode,
    };
};
