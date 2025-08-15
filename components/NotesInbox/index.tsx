
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { KindleNote, ImportedNoteSource } from '../../types';
import * as notesParser from '../../services/notesParser';
import { ChevronLeft, BookOpenIcon, UploadCloudIcon, Trash2, Edit, Check, X, Square, CheckSquare, RefreshCw } from '../icons';

interface NotesInboxProps {
    isOpen: boolean;
    onClose: () => void;
    importedNoteSources: ImportedNoteSource[];
    processedNoteIds: Set<string>;
    onImportNotes: (data: { bookTitle: string; author: string; notes: Omit<KindleNote, 'sourceId'>[] }) => void;
    onDeleteSource: (sourceId: string) => void;
    onUpdateSourceMetadata: (sourceId: string, newTitle: string, newAuthor: string) => void;
    onMarkNotesAsProcessed: (noteIds: string[]) => void;
}


const highlightColorClasses: { [key: string]: string } = {
    yellow: 'bg-yellow-400/20 text-yellow-300 ring-yellow-400/30',
    blue: 'bg-blue-400/20 text-blue-300 ring-blue-400/30',
    pink: 'bg-pink-400/20 text-pink-300 ring-pink-400/30',
    orange: 'bg-orange-400/20 text-orange-300 ring-orange-400/30',
};

const NoteCard: React.FC<{ 
    note: KindleNote; 
    isProcessed: boolean;
    isSelected: boolean;
    onToggleSelect: () => void;
}> = ({ note, isProcessed, isSelected, onToggleSelect }) => {
    const colorClass = note.color ? highlightColorClasses[note.color] || 'bg-gray-400/20 text-gray-300 ring-gray-400/30' : 'bg-gray-400/20 text-gray-300 ring-gray-400/30';

    const handleDragStart = (e: React.DragEvent<HTMLLIElement>, note: KindleNote) => {
        e.dataTransfer.setData('application/x-kindle-note', JSON.stringify(note));
        e.dataTransfer.effectAllowed = 'copy';
    };

    return (
        <li
            draggable
            onDragStart={(e) => handleDragStart(e, note)}
            title="Drag to add to map"
            className={`group relative p-3 rounded-md transition-all duration-200 ${isProcessed ? 'opacity-40' : ''} ${isSelected ? 'bg-cyan-900/50 ring-2 ring-cyan-500' : 'bg-gray-800 hover:bg-gray-700'}`}
        >
             <div className="absolute top-2 left-2 z-10">
                <button onClick={onToggleSelect} className="p-1" aria-label={isSelected ? `Deselect note` : `Select note`}>
                    {isSelected 
                        ? <CheckSquare className="w-5 h-5 text-cyan-400" /> 
                        : <Square className="w-5 h-5 text-gray-500 group-hover:text-gray-300" />
                    }
                </button>
            </div>
            <div className="pl-8 cursor-grab">
                <p className="text-sm text-gray-200">{note.text}</p>
                <div className="text-xs text-gray-500 mt-2 flex justify-between items-center">
                    <span className="truncate pr-2">{note.heading}</span>
                    {note.type === 'highlight' ? (
                        note.color && <div className={`px-1.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${colorClass}`}>{note.color}</div>
                    ) : (
                        <div className="px-1.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset bg-gray-600 text-gray-200 ring-gray-500">Note</div>
                    )}
                </div>
            </div>
        </li>
    );
};

type PendingImport = { bookTitle: string; author: string; notes: Omit<KindleNote, 'sourceId'>[] };

const NotesInbox: React.FC<NotesInboxProps> = ({ isOpen, onClose, importedNoteSources, processedNoteIds, onImportNotes, onDeleteSource, onUpdateSourceMetadata, onMarkNotesAsProcessed }) => {
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
    const [editingSource, setEditingSource] = useState<{ id: string; title: string; author: string } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
    const [showProcessed, setShowProcessed] = useState(true);
    const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) {
            setSelectedSourceId(null);
            setEditingSource(null);
            setSearchQuery('');
            setSelectedNoteIds(new Set());
            setPendingImport(null);
        }
    }, [isOpen]);
    
    useEffect(() => {
        setSelectedNoteIds(new Set());
    }, [selectedSourceId, showProcessed, searchQuery]);

    const selectedSource = useMemo(() => {
        return importedNoteSources.find(s => s.id === selectedSourceId);
    }, [selectedSourceId, importedNoteSources]);

    const displayedNotes = useMemo(() => {
        if (!selectedSource) return [];
        let notes = selectedSource.notes;
        if (!showProcessed) {
            notes = notes.filter(note => !processedNoteIds.has(note.id));
        }
        if (searchQuery.trim()) {
            const lowerCaseQuery = searchQuery.toLowerCase();
            notes = notes.filter(note => 
                note.text.toLowerCase().includes(lowerCaseQuery) ||
                note.heading.toLowerCase().includes(lowerCaseQuery)
            );
        }
        return notes;
    }, [selectedSource, showProcessed, processedNoteIds, searchQuery]);
    
    const handleToggleSelect = (noteId: string) => {
        setSelectedNoteIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(noteId)) newSet.delete(noteId);
            else newSet.add(noteId);
            return newSet;
        });
    };
    
    const handleSelectAll = () => {
        if (selectedNoteIds.size === displayedNotes.length) {
            setSelectedNoteIds(new Set());
        } else {
            setSelectedNoteIds(new Set(displayedNotes.map(n => n.id)));
        }
    };

    const handleBatchDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        if (!selectedSource) return;
        const selectedNotes = selectedSource.notes.filter(n => selectedNoteIds.has(n.id));
        e.dataTransfer.setData('application/x-kindle-notes-multiple', JSON.stringify(selectedNotes));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleMarkSelectedAsProcessed = () => {
        onMarkNotesAsProcessed(Array.from(selectedNoteIds));
        setSelectedNoteIds(new Set());
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const htmlString = event.target?.result as string;
            try {
                const parsedData = notesParser.parseKindleHTML(htmlString);
                setPendingImport(parsedData);
            } catch (error) {
                alert(`Failed to parse notes file. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset file input
    };

    const handleConfirmImport = () => {
        if (pendingImport) {
            onImportNotes(pendingImport);
            setPendingImport(null);
        }
    };

    const handleSaveMetadata = () => {
        if (editingSource) {
            onUpdateSourceMetadata(editingSource.id, editingSource.title.trim(), editingSource.author.trim());
            setEditingSource(null);
        }
    };

    const renderImportConfirmation = () => {
        if (!pendingImport) return null;
        return (
             <div className="flex flex-col flex-grow p-4 space-y-4">
                <button onClick={() => setPendingImport(null)} className="flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-200 self-start">
                    <ChevronLeft className="w-4 h-4" /> Cancel Import
                </button>
                <h4 className="font-bold text-white text-lg">Confirm Import</h4>
                <p className="text-sm text-gray-400">Please confirm or edit the details for this note source.</p>
                
                <div>
                    <label htmlFor="import-title" className="block text-xs font-medium text-gray-300 mb-1">Book Title</label>
                    <input id="import-title" type="text" value={pendingImport.bookTitle} onChange={e => setPendingImport(p => p ? {...p, bookTitle: e.target.value} : null)} className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-sm" />
                </div>
                <div>
                    <label htmlFor="import-author" className="block text-xs font-medium text-gray-300 mb-1">Author</label>
                    <input id="import-author" type="text" value={pendingImport.author} onChange={e => setPendingImport(p => p ? {...p, author: e.target.value} : null)} className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-sm" />
                </div>
                
                <div className="text-sm text-gray-400">
                    <span className="font-semibold">{pendingImport.notes.length}</span> notes found.
                </div>
                
                <button onClick={handleConfirmImport} className="w-full px-4 py-2 bg-cyan-600 text-white font-bold rounded-md hover:bg-cyan-700 transition-colors">
                    Add Source
                </button>
            </div>
        )
    };
    
    const renderSourceList = () => (
        <div className="flex flex-col flex-grow overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex-shrink-0">
                <h4 className="font-bold text-white mb-2">Note Sources</h4>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 transition-colors font-semibold text-sm"
                >
                    <UploadCloudIcon className="w-5 h-5"/>
                    Import New Notes
                </button>
            </div>
            {importedNoteSources.length > 0 ? (
                <ul className="flex-grow p-2 space-y-2 overflow-y-auto">
                    {importedNoteSources.map(source => (
                        <li key={source.id} className="group bg-gray-800 rounded-md hover:bg-gray-700/70 transition-colors relative">
                            {editingSource?.id === source.id ? (
                                <div className="p-3 space-y-2">
                                    <input type="text" value={editingSource.title} onChange={e => setEditingSource(es => es ? {...es, title: e.target.value} : null)} className="w-full p-1 bg-gray-900 border border-gray-600 rounded-md text-sm" placeholder="Title"/>
                                    <input type="text" value={editingSource.author} onChange={e => setEditingSource(es => es ? {...es, author: e.target.value} : null)} className="w-full p-1 bg-gray-900 border border-gray-600 rounded-md text-sm" placeholder="Author"/>
                                    <div className="flex gap-2">
                                        <button onClick={handleSaveMetadata} className="p-1 text-green-400 hover:text-green-300" aria-label="Save changes"><Check className="w-5 h-5"/></button>
                                        <button onClick={() => setEditingSource(null)} className="p-1 text-red-400 hover:text-red-300" aria-label="Cancel editing"><X className="w-5 h-5"/></button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="absolute top-1 right-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                        <button onClick={() => setEditingSource({id: source.id, title: source.bookTitle, author: source.author})} className="p-1 text-gray-400 hover:text-cyan-400" aria-label="Edit source metadata"><Edit className="w-4 h-4"/></button>
                                        <button onClick={() => { if(confirm('Are you sure you want to delete this source and all its notes?')) onDeleteSource(source.id)}} className="p-1 text-gray-400 hover:text-red-400" aria-label="Delete source"><Trash2 className="w-4 h-4"/></button>
                                    </div>
                                    <button onClick={() => setSelectedSourceId(source.id)} className="w-full text-left p-3">
                                        <h5 className="font-semibold text-gray-100 truncate pr-12">{source.bookTitle}</h5>
                                        <p className="text-xs text-gray-400">{source.author}</p>
                                        <p className="text-xs text-gray-500 mt-1">{source.notes.length} notes</p>
                                    </button>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                 <div className="p-4 text-center text-gray-400 text-sm flex-grow flex flex-col items-center justify-center">
                    <p className="font-semibold mb-2">No notes imported for this project.</p>
                    <p className="max-w-xs">Export your notes from the Kindle web reader as an HTML file to get started.</p>
                </div>
            )}
        </div>
    );

    const renderNotesView = () => {
        if (!selectedSource) return null;
        const allDisplayedSelected = displayedNotes.length > 0 && selectedNoteIds.size === displayedNotes.length;
        return (
            <div className="flex flex-col flex-grow overflow-hidden relative">
                <div className="p-4 border-b border-gray-700 flex-shrink-0 space-y-3">
                    <button onClick={() => setSelectedSourceId(null)} className="flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-200">
                        <ChevronLeft className="w-4 h-4" /> Back to Sources
                    </button>
                    <div>
                        <h4 className="font-bold text-white truncate">{selectedSource.bookTitle}</h4>
                        <p className="text-sm text-gray-400">{selectedSource.author}</p>
                    </div>
                     <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`Search ${selectedSource.notes.length} notes...`}
                        className="w-full p-2 bg-gray-800 border border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                    />
                     <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2 text-gray-300">
                            <input type="checkbox" checked={showProcessed} onChange={(e) => setShowProcessed(e.target.checked)} className="form-checkbox h-4 w-4 rounded bg-gray-900 border-gray-600 text-cyan-500 focus:ring-cyan-500" />
                            Show Processed
                        </label>
                        <button onClick={handleSelectAll} className="text-cyan-400 hover:underline">
                            {allDisplayedSelected ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>
                </div>
                {displayedNotes.length > 0 ? (
                    <ul className="flex-grow p-2 space-y-2 overflow-y-auto pb-16">
                        {displayedNotes.map(note => (
                            <NoteCard key={note.id} note={note} isProcessed={processedNoteIds.has(note.id)} isSelected={selectedNoteIds.has(note.id)} onToggleSelect={() => handleToggleSelect(note.id)} />
                        ))}
                    </ul>
                ) : (
                     <div className="p-4 text-center text-gray-500 text-sm flex-grow flex flex-col items-center justify-center">
                        <p>No notes to display.</p>
                     </div>
                )}
                {selectedNoteIds.size > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 p-2 flex items-center justify-between z-10 animate-fade-in">
                        <span className="text-sm text-gray-300 px-2">{selectedNoteIds.size} selected</span>
                        <div className="flex items-center gap-2">
                            <button onClick={handleMarkSelectedAsProcessed} className="px-3 py-1 bg-gray-700 text-xs rounded hover:bg-gray-600">Mark as Processed</button>
                            <div 
                                draggable 
                                onDragStart={handleBatchDragStart} 
                                className="px-3 py-1 bg-cyan-700 text-white text-xs font-bold rounded cursor-grab active:cursor-grabbing"
                            >
                                Drag Group
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    let content;
    if (pendingImport) {
        content = renderImportConfirmation();
    } else if (selectedSourceId) {
        content = renderNotesView();
    } else {
        content = renderSourceList();
    }

    return (
        <div
            className={`fixed top-0 left-0 h-full bg-black/80 backdrop-blur-md border-r border-gray-600 z-30 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} w-96 flex flex-col`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-inbox-title"
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".html"
                className="hidden"
            />
            <div className="flex justify-between items-center p-4 border-b border-gray-600 flex-shrink-0">
                <h3 id="notes-inbox-title" className="text-lg font-bold text-cyan-300 flex items-center gap-2">
                    <BookOpenIcon className="w-6 h-6"/>
                    Notes Inbox
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close Notes Inbox">
                    <ChevronLeft className="w-6 h-6" />
                </button>
            </div>
            
            {content}
        </div>
    );
};

export default NotesInbox;