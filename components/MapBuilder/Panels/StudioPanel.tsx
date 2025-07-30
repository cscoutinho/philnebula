import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { X, NoteIcon, DownloadIcon, UndoIcon, RedoIcon, BoldIcon, ItalicIcon, SparkleIcon, Check, PaletteIcon, FontSizeIcon, RefreshCw, CopyIcon, InsertBelowIcon } from '../../icons';

const useHistoryState = <T,>(initialState: T): [T, (newState: T, immediate?: boolean) => void, () => void, () => void, boolean, boolean] => {
    const [history, setHistory] = useState<T[]>([initialState]);
    const [index, setIndex] = useState(0);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const setState = useCallback((newState: T, immediate = false) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        
        const update = () => {
            if (newState === history[index]) return;
            const newHistory = history.slice(0, index + 1);
            newHistory.push(newState);
            setHistory(newHistory);
            setIndex(newHistory.length - 1);
        };
        
        if (immediate) {
            update();
        } else {
            timeoutRef.current = setTimeout(update, 300);
        }

    }, [history, index]);

    const undo = useCallback(() => {
        if (index > 0) setIndex(index - 1);
    }, [index]);

    const redo = useCallback(() => {
        if (index < history.length - 1) setIndex(index + 1);
    }, [index, history.length]);

    const canUndo = index > 0;
    const canRedo = index < history.length - 1;

    return [history[index], setState, undo, redo, canUndo, canRedo];
};

interface StudioPanelProps {
    state: { nodeId: string | number; x: number; y: number };
    initialNotes: string;
    nodeName: string;
    onClose: () => void;
    onSave: (nodeId: string | number, content: string) => void;
    ai: GoogleGenAI;
}

const fontSizes = [
    { name: 'Small', value: '2' },
    { name: 'Normal', value: '3' },
    { name: 'Large', value: '5' },
    { name: 'Heading', value: '6' },
];
const textColors = ['#FFFFFF', '#FDE047', '#A7F3D0', '#A5B4FC', '#F9A8D4', '#FCA5A5'];

const HIGHLIGHT_SPAN_ID = 'studio-highlight-span';

const simpleMarkdownToHtml = (markdown: string): string => {
    // Escape basic HTML characters to prevent injection before we add our own.
    let processed = markdown
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Bold
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Process lines for lists and paragraphs
    const lines = processed.split('\n');
    let html = '';
    let inList = false;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('* ')) {
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            html += `<li>${trimmedLine.substring(2)}</li>`;
        } else {
            if (inList) {
                html += '</ul>';
                inList = false;
            }
            if (trimmedLine) {
                html += `<p>${trimmedLine}</p>`;
            }
        }
    }
    if (inList) {
        html += '</ul>';
    }
    return html;
};


const StudioPanel: React.FC<StudioPanelProps> = ({ state, initialNotes, nodeName, onClose, onSave, ai }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [size, setSize] = useState({ width: 600, height: 450 });
    const [content, setContent, undo, redo, canUndo, canRedo] = useHistoryState(initialNotes || '<p><br></p>');
    const [aiPrompt, setAiPrompt] = useState<{ text: string, rect: DOMRect, userInput: string } | null>(null);
    const [aiSuggestion, setAiSuggestion] = useState<{ text: string, range: Range } | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [isFontSizePickerOpen, setIsFontSizePickerOpen] = useState(false);
    const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
    const [isStylusDetected, setIsStylusDetected] = useState(false);

    const panelRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const aiToolbarRef = useRef<HTMLDivElement>(null);
    const aiSuggestionRef = useRef<HTMLDivElement>(null);
    const savedRange = useRef<Range | null>(null);

    // Effect to save content automatically
    useEffect(() => {
        const handler = setTimeout(() => {
            if (content !== initialNotes) {
                onSave(state.nodeId, content);
            }
        }, 1000);
        return () => clearTimeout(handler);
    }, [content, initialNotes, onSave, state.nodeId]);

    // Effect to update panel position
    useEffect(() => {
        if (panelRef.current) {
            const { innerWidth, innerHeight } = window;
            const p = panelRef.current.getBoundingClientRect();
            const left = Math.max(10, Math.min(state.x - p.width / 2, innerWidth - p.width - 10));
            const top = Math.max(10, Math.min(state.y - p.height / 2, innerHeight - p.height - 10));
            setPosition({ x: left, y: top });
        }
    }, [state.x, state.y]);
    
    // Effect to sync editor content with history state
    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== content) {
            const currentSelection = window.getSelection();
            const range = currentSelection && currentSelection.rangeCount > 0 ? currentSelection.getRangeAt(0) : null;
            const startOffset = range?.startOffset;
            const startContainer = range?.startContainer;
            
            editorRef.current.innerHTML = content;

            if(startContainer && startOffset !== undefined) {
                 try {
                    const newRange = document.createRange();
                    newRange.setStart(startContainer, Math.min(startOffset, startContainer.nodeValue?.length ?? 0));
                    newRange.collapse(true);
                    currentSelection?.removeAllRanges();
                    currentSelection?.addRange(newRange);
                } catch(e) {
                    console.warn("Could not restore cursor position after undo/redo.", e);
                }
            }
        }
    }, [content]);

    // Draggable Panel Logic
    useEffect(() => {
        const header = headerRef.current;
        const panel = panelRef.current;
        if (!header || !panel) return;

        const onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
            e.preventDefault();
            const startPos = { x: e.clientX, y: e.clientY };
            const initialPanelPos = { x: panel.offsetLeft, y: panel.offsetTop };
            const onPointerMove = (e: PointerEvent) => {
                const dx = e.clientX - startPos.x;
                const dy = e.clientY - startPos.y;
                setPosition({ x: initialPanelPos.x + dx, y: initialPanelPos.y + dy });
            };
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', () => window.removeEventListener('pointermove', onPointerMove), { once: true });
        };
        header.addEventListener('pointerdown', onPointerDown);
        return () => header.removeEventListener('pointerdown', onPointerDown);
    }, []);

    const removeHighlight = useCallback(() => {
        const span = editorRef.current?.querySelector(`#${HIGHLIGHT_SPAN_ID}`);
        if (span && span.parentNode) {
            const parent = span.parentNode;
            while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
            }
            parent.removeChild(span);
            parent.normalize();
        }
    }, []);

    const cleanupAiInteraction = useCallback(() => {
        setAiPrompt(null);
        setAiSuggestion(null);
        removeHighlight();
    }, [removeHighlight]);

    // Click Away Logic
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                panelRef.current && !panelRef.current.contains(event.target as Node) &&
                (!aiToolbarRef.current || !aiToolbarRef.current.contains(event.target as Node)) &&
                (!aiSuggestionRef.current || !aiSuggestionRef.current.contains(event.target as Node))
            ) {
                cleanupAiInteraction();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [cleanupAiInteraction]);

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        const newContent = e.currentTarget.innerHTML;
        cleanupAiInteraction();
        setContent(newContent);
    };

    // Stylus detection for optimized input handling (silent detection)
    const handleStylusDetection = useCallback(() => {
        setIsStylusDetected(true);
        // Silent detection - just track that stylus is being used for internal optimizations
    }, []);

    // Enhanced stylus/pen support for Android devices with silent detection
    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        // Multiple detection methods for stylus
        const isDirectPen = e.pointerType === 'pen';
        const isHeuristicStylus = e.pointerType === 'touch' && (
            e.pressure > 0.3 || 
            (e.width > 0 && e.width < 15) || 
            (e.height > 0 && e.height < 15)
        );

        if (isDirectPen) {
            handleStylusDetection();
        } else if (isHeuristicStylus) {
            handleStylusDetection();
        }

        if (isDirectPen || isHeuristicStylus) {
            // Enable high precision mode for stylus
            const target = e.currentTarget;
            if (target && 'setPointerCapture' in target) {
                try {
                    target.setPointerCapture(e.pointerId);
                } catch (err) {
                    // Ignore capture errors
                }
            }
            
            // Focus the editor for immediate input
            editorRef.current?.focus();
            
            // Set cursor position at the pointer location
            try {
                const range = document.caretRangeFromPoint(e.clientX, e.clientY);
                if (range) {
                    const selection = window.getSelection();
                    if (selection) {
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            } catch (err) {
                // Ignore cursor positioning errors
            }
        }
    }, [handleStylusDetection]);

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        // Handle pen/stylus writing while moving
        if (e.pointerType === 'pen' && e.pressure > 0) {
            // Ensure the editor maintains focus during stylus movement
            if (document.activeElement !== editorRef.current) {
                editorRef.current?.focus();
            }
        }
    }, []);

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === 'pen') {
            // Release pointer capture
            const target = e.currentTarget;
            if (target && 'releasePointerCapture' in target) {
                try {
                    target.releasePointerCapture(e.pointerId);
                } catch (err) {
                    // Ignore if capture was already released
                }
            }
            
            // Save content after stylus input
            if (editorRef.current) {
                setContent(editorRef.current.innerHTML, true);
            }
        }
    }, [setContent]);

    // Enhanced touch support for stylus detection
    const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            
            // Enhanced stylus detection via touch properties
            const isPossiblyStylus = 
                (touch.force !== undefined && touch.force > 0.3) ||
                (touch.radiusX !== undefined && touch.radiusX < 15) ||
                (touch.radiusY !== undefined && touch.radiusY < 15) ||
                // Some stylus have very precise touch points
                (touch.radiusX === undefined && touch.radiusY === undefined);
            
            if (isPossiblyStylus && !isStylusDetected) {
                handleStylusDetection();
            }
            
            // Focus the editor and position cursor
            editorRef.current?.focus();
            
            try {
                const range = document.caretRangeFromPoint(touch.clientX, touch.clientY);
                if (range) {
                    const selection = window.getSelection();
                    if (selection) {
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            } catch (err) {
                // Ignore cursor positioning errors
            }
        }
    }, [isStylusDetected, handleStylusDetection]);

    const handleExecCommand = useCallback((command: string, value?: string) => {
        editorRef.current?.focus();
        document.execCommand(command, false, value);
        if (editorRef.current) {
            setContent(editorRef.current.innerHTML, true);
        }
        setIsColorPickerOpen(false);
        setIsFontSizePickerOpen(false);
        cleanupAiInteraction();
    }, [setContent, cleanupAiInteraction]);

    const handleAiSelection = useCallback(() => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (editorRef.current?.contains(range.commonAncestorContainer)) {
                cleanupAiInteraction();
                (document.activeElement as HTMLElement)?.blur();

                const span = document.createElement('span');
                span.id = HIGHLIGHT_SPAN_ID;
                span.className = 'simulated-highlight';
                try {
                    range.surroundContents(span);
                    savedRange.current = range;
                    setAiPrompt({ text: range.toString(), rect: range.getBoundingClientRect(), userInput: '' });
                    setIsColorPickerOpen(false);
                    setIsFontSizePickerOpen(false);
                    setIsDownloadMenuOpen(false);
                } catch (e) {
                    console.error("Could not create highlight:", e);
                    cleanupAiInteraction();
                }
            } else {
                 alert("Please select text within the Studio editor to use 'Ask AI'.");
            }
        } else {
            alert("Please select some text before using 'Ask AI'.");
        }
    }, [cleanupAiInteraction]);

    const handleAskAI = async () => {
        if (!aiPrompt || !savedRange.current) return;
        setIsAiLoading(true);

        const systemInstruction = "You are a versatile AI research and writing assistant. Your purpose is to help the user think, research, and write. You can summarize, explain complex concepts, brainstorm ideas, give context, and rephrase text. Respond clearly and concisely to the user's instruction. Use markdown (like bullet points) if it enhances readability. Provide the answer directly, without conversational filler.";
        const userInstruction = aiPrompt.userInput || 'Improve the selected text for clarity and conciseness.';
        const prompt = `CONTEXT (selected text):\n---\n${aiPrompt.text}\n---\n\nUSER COMMAND:\n---\n${userInstruction}\n---\n`;

        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { systemInstruction } });
            setAiSuggestion({ text: response.text, range: savedRange.current });
        } catch (error) { console.error("AI suggestion failed:", error); }
        finally {
            setIsAiLoading(false);
            setAiPrompt(null);
            removeHighlight();
        }
    };
    
    const handleReplace = () => {
        if (!aiSuggestion) return;
        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(aiSuggestion.range);
        }
        document.execCommand('insertHTML', false, aiSuggestion.text.replace(/\n/g, '<br>'));
        if (editorRef.current) setContent(editorRef.current.innerHTML, true);
        cleanupAiInteraction();
    };

    const handleInsertBelow = () => {
        if (!aiSuggestion || !editorRef.current || !savedRange.current) return;
    
        const editor = editorRef.current;
        const htmlToInsert = `<br>${simpleMarkdownToHtml(aiSuggestion.text)}`;
        
        const range = savedRange.current;
        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            range.collapse(false); // Move to the end of the original selection
            sel.addRange(range);
            editor.focus();
        }
        
        document.execCommand('insertHTML', false, htmlToInsert);
    
        setContent(editor.innerHTML, true);
        cleanupAiInteraction();
    };
    
    const handleCopy = () => {
        if (!aiSuggestion) return;
        navigator.clipboard.writeText(aiSuggestion.text).catch(err => {
            console.error('Failed to copy text: ', err);
        });
        cleanupAiInteraction();
    };

    const handleDownload = (format: 'md' | 'txt') => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const fileContent = format === 'txt' ? (tempDiv.textContent || tempDiv.innerText || '') : content;
        const blob = new Blob([fileContent], { type: format === 'txt' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${nodeName.replace(/ /g, '_')}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        setIsDownloadMenuOpen(false);
    };
    
    return (
        <div
            ref={panelRef}
            style={{ top: position.y, left: position.x, width: size.width, height: size.height, minWidth: 400, minHeight: 300 }}
            className="fixed bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 text-white flex flex-col resize overflow-hidden"
        >
            <div ref={headerRef} className="flex justify-between items-center p-2 border-b border-gray-700 bg-gray-800 rounded-t-lg cursor-grab active:cursor-grabbing flex-shrink-0">
                <h3 className="text-md font-bold text-cyan-300 flex items-center gap-2 pl-2"><NoteIcon className="w-5 h-5"/> Studio: {nodeName}</h3>
                <div className="flex items-center gap-1">
                    <div className="relative">
                        <button onClick={() => setIsDownloadMenuOpen(p => !p)} title="Download" className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"><DownloadIcon className="w-4 h-4"/></button>
                        {isDownloadMenuOpen && (
                            <div className="absolute top-full right-0 mt-1 w-40 bg-gray-800 border border-gray-600 rounded-md shadow-lg p-1 z-50">
                                <button onClick={() => handleDownload('md')} className="block w-full text-left px-3 py-1.5 hover:bg-gray-700 rounded text-sm">Save as Markdown</button>
                                <button onClick={() => handleDownload('txt')} className="block w-full text-left px-3 py-1.5 hover:bg-gray-700 rounded text-sm">Save as Plain Text</button>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"><X className="w-5 h-5"/></button>
                </div>
            </div>

            <div className="flex items-center p-2 border-b border-gray-700 bg-gray-800/50 flex-shrink-0 gap-1">
                <button onClick={undo} disabled={!canUndo} className="p-1.5 text-gray-300 hover:bg-gray-700 rounded disabled:opacity-50" title="Undo"><UndoIcon className="w-4 h-4"/></button>
                <button onClick={redo} disabled={!canRedo} className="p-1.5 text-gray-300 hover:bg-gray-700 rounded disabled:opacity-50" title="Redo"><RedoIcon className="w-4 h-4"/></button>
                <div className="w-px h-5 bg-gray-600 mx-1"></div>
                <button onClick={() => handleExecCommand('bold')} className="p-1.5 text-gray-300 hover:bg-gray-700 rounded" title="Bold"><BoldIcon className="w-4 h-4"/></button>
                <button onClick={() => handleExecCommand('italic')} className="p-1.5 text-gray-300 hover:bg-gray-700 rounded" title="Italic"><ItalicIcon className="w-4 h-4"/></button>
                <div className="w-px h-5 bg-gray-600 mx-1"></div>
                <div className="relative">
                    <button onClick={() => { setIsColorPickerOpen(p => !p); setIsFontSizePickerOpen(false); }} className="p-1.5 text-gray-300 hover:bg-gray-700 rounded" title="Text Color"><PaletteIcon className="w-4 h-4"/></button>
                    {isColorPickerOpen && (
                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg p-2 z-50 flex gap-2">
                            {textColors.map(color => <button key={color} onClick={() => handleExecCommand('foreColor', color)} className="w-5 h-5 rounded-full border-2 border-transparent hover:border-white" style={{ backgroundColor: color }} />)}
                        </div>
                    )}
                </div>
                <div className="relative">
                    <button onClick={() => { setIsFontSizePickerOpen(p => !p); setIsColorPickerOpen(false); }} className="p-1.5 text-gray-300 hover:bg-gray-700 rounded" title="Font Size"><FontSizeIcon className="w-4 h-4"/></button>
                    {isFontSizePickerOpen && (
                        <div className="absolute top-full left-0 mt-1 w-28 bg-gray-800 border border-gray-600 rounded-md shadow-lg p-1 z-50">
                            {fontSizes.map(size => <button key={size.name} onClick={() => handleExecCommand('fontSize', size.value)} className="block w-full text-left px-3 py-1.5 hover:bg-gray-700 rounded text-sm">{size.name}</button>)}
                        </div>
                    )}
                </div>
                <div className="w-px h-5 bg-gray-600 mx-1"></div>
                <button onClick={handleAiSelection} className="p-1.5 text-gray-300 hover:bg-gray-700 rounded flex items-center gap-1.5 text-sm" title="Ask AI to edit selected text">
                    <SparkleIcon className="w-4 h-4 text-purple-400"/>
                    Ask AI
                </button>
            </div>

            <div className="flex-grow p-4 overflow-y-auto" onClick={() => { editorRef.current?.focus(); cleanupAiInteraction(); }}>
                <div
                    ref={editorRef}
                    contentEditable={true}
                    onInput={handleInput}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onTouchStart={handleTouchStart}
                    suppressContentEditableWarning={true}
                    className="w-full h-full bg-transparent text-gray-200 outline-none resize-none leading-relaxed prose prose-invert prose-sm max-w-none"
                    style={{
                        touchAction: 'manipulation', // Allow basic touch but prevent zoom/scroll during writing
                        WebkitUserSelect: 'text',
                        userSelect: 'text',
                        // Improve stylus writing experience on Android
                        WebkitTapHighlightColor: 'transparent', // Remove tap highlight
                        WebkitTouchCallout: 'none', // Disable callout on long press
                    }}
                />
            </div>

            {aiPrompt && !aiSuggestion && (
                <div ref={aiToolbarRef} style={{ top: aiPrompt.rect.bottom + window.scrollY + 5, left: aiPrompt.rect.left + window.scrollX }} className="fixed z-[60] flex items-center gap-2 p-1 bg-gray-800 border border-gray-600 text-white rounded-lg shadow-lg animate-fade-in">
                    <SparkleIcon className="w-4 h-4 text-purple-400 flex-shrink-0 ml-1" />
                    <input
                        type="text"
                        value={aiPrompt.userInput}
                        onChange={(e) => setAiPrompt(p => p ? {...p, userInput: e.target.value} : null)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAskAI()}
                        placeholder="Ask AI"
                        className="bg-transparent outline-none text-sm w-48"
                        autoFocus
                    />
                    <button onClick={handleAskAI} disabled={isAiLoading} className="p-1.5 bg-purple-600 hover:bg-purple-700 rounded-md disabled:bg-gray-500">
                        {isAiLoading ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4"/>}
                    </button>
                </div>
            )}
            {aiSuggestion && (
                <div ref={aiSuggestionRef} style={{ top: aiSuggestion.range.getBoundingClientRect().bottom + window.scrollY + 5, left: aiSuggestion.range.getBoundingClientRect().left + window.scrollX }} className="fixed z-[60] bg-gray-800 border border-purple-500 rounded-lg shadow-xl p-3 max-w-md animate-fade-in">
                    <div 
                        className="prose prose-invert prose-sm max-w-none mb-3 text-gray-200"
                        dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(aiSuggestion.text) }} 
                    />
                    <div className="flex justify-end gap-2">
                        <button onClick={cleanupAiInteraction} className="px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded">Dismiss</button>
                        <button onClick={handleCopy} className="px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center gap-1"><CopyIcon className="w-3 h-3"/>Copy</button>
                        <button onClick={handleInsertBelow} className="px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center gap-1"><InsertBelowIcon className="w-3 h-3"/>Insert Below</button>
                        <button onClick={handleReplace} className="px-3 py-1 text-xs bg-purple-600 text-white hover:bg-purple-700 rounded flex items-center gap-1"><Check className="w-3 h-3"/>Replace</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudioPanel;