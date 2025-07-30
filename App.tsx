
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { parseMarkdown, flattenData } from './services/dataParser';
import { D3Node, D3Link, Publication, CustomRelationshipType } from './types';
import NebulaGraph from './components/NebulaGraph';
import InfoPanel from './components/InfoPanel';
import SearchInput from './components/SearchInput';
import SearchResultsDropdown from './components/SearchResultsDropdown';
import ViewSwitcher from './components/ViewSwitcher';
import MapBuilder from './components/MapBuilder/index';
import MapTray from './components/MapTray';
import FeedPage from './components/FeedPage';
import SettingsModal from './components/SettingsModal';
import ProjectSwitcher from './components/ProjectSwitcher';
import ProjectDiaryPanel from './components/ProjectDiaryPanel';
import { BrainCircuit, SettingsIcon, DiaryIcon } from './components/icons';
import { useSessionManager } from './hooks/useSessionManager';
import { useFeedManager } from './hooks/useFeedManager';
import { useNebula } from './hooks/useNebula';

const defaultRelationshipTypes = [
    // Foundational & Structural
    { type: 'Hierarchical', color: '#f59e0b', description: 'General to specific' }, // amber-500
    { type: 'Causal', color: '#3b82f6', description: 'Cause to effect' }, // blue-500
    { type: 'Definitional', color: '#84cc16', description: 'Defines or analyzes' }, // lime-500
    // Logical & Evidentiary
    { type: 'Supportive', color: '#22c55e', description: 'Provides evidence for' }, // green-500
    { type: 'Exemplifies', color: '#06b6d4', description: 'Is an example of' }, // cyan-500
    // Dynamic & Responsive
    { type: 'Contextual', color: '#a855f7', description: 'Developed in response to' }, // purple-500
    { type: 'Synthesizes', color: '#6366f1', description: 'Integrates or combines' }, // indigo-500
    // Oppositional
    { type: 'Oppositional', color: '#ef4444', description: 'In tension with' }, // red-500
    { type: 'Refutes', color: '#d946ef', description: 'Challenges or disproves' }, // fuchsia-500
    // Generic
    { type: 'Unclassified', color: '#9ca3af', description: 'Generic link' }, // gray-400
];

const SUPABASE_URL = 'https://kowbxomppzqgmfagzirc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtvd2J4b21wcHpxZ21mYWd6aXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyOTI1MTMsImV4cCI6MjA2ODg2ODUxM30.3R92DVk_HPQBtGc4V3stf7UWQxMeNeazXdZEj_BZdk0';

const App: React.FC = () => {
    // Core Data
    const [data, setData] = useState<{ nodes: D3Node[], links: D3Link[] } | null>(null);

    // AI Instance
    const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY! }), []);

    // --- Custom Hooks for State and Logic Management ---
    const {
        session,
        setSession,
        activeProject,
        activeProjectData,
        updateActiveProjectData,
        logActivity,
        handleCreateProject,
        handleSwitchProject,
        handleDeleteProject,
        handleRenameProject,
    } = useSessionManager();

    const {
        allPublications,
        setAllPublications,
        isFeedLoading,
        handleAddFeed,
        handleRemoveFeed,
        handleRefreshFeeds,
        handleRefreshSingleFeed,
        handleMarkAsSeen,
    } = useFeedManager(activeProjectData, updateActiveProjectData, logActivity);

    const {
        selectedNode,
        setSelectedNode,
        focusedNode,
        setFocusedNode,
        searchQuery,
        setSearchQuery,
        searchResults,
        setSearchResults,
        crossLinks,
        isLoadingCrossLinks,
        relatedConcepts,
        hoveredNode,
        setHoveredNode,
        searchAttempted,
        findRelatedConcepts,
        handleSearchChange,
    } = useNebula(data, ai, logActivity);
    
    // View Management
    const [currentView, setCurrentView] = useState<'nebula' | 'map' | 'feed'>('nebula');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isDiaryOpen, setIsDiaryOpen] = useState(false);
    
    // --- Derived State and Memos ---
    const allRelationshipTypes = useMemo(() => {
        const disabledDefaults = new Set(session.disabledDefaultTypes || []);
        const disabledCustoms = new Set(session.disabledCustomTypes || []);
    
        const activeDefaults = defaultRelationshipTypes.filter(
            (rt) => !disabledDefaults.has(rt.type)
        );
    
        const activeCustoms = (session.customRelationshipTypes || [])
            .filter((rt) => !disabledCustoms.has(rt.name))
            .map(ct => ({ type: ct.name, color: ct.color, description: ct.description }));
            
        return [...activeDefaults, ...activeCustoms];
    }, [session.customRelationshipTypes, session.disabledDefaultTypes, session.disabledCustomTypes]);

    const mapTrayConcepts = useMemo(() => {
        if (!data || !activeProjectData) return [];
        const nodeMap = new Map(data.nodes.map(node => [node.id, node]));
        return activeProjectData.mapTrayConceptIds.map(id => nodeMap.get(id)).filter((node): node is D3Node => !!node);
    }, [activeProjectData, data]);

    const nodeIdsWithNewPublications = useMemo(() => {
        if (!activeProjectData) return new Set<number>();
        const feedUrlToNodeId = new Map(activeProjectData.trackedFeeds.map(f => [f.url, f.nodeId]));
        const newPubNodeIds = new Set<number>();
        for (const pub of allPublications) {
            if (pub.isNew) {
                const nodeId = feedUrlToNodeId.get(pub.sourceUrl);
                if (nodeId !== undefined) {
                    newPubNodeIds.add(nodeId);
                }
            }
        }
        return newPubNodeIds;
    }, [allPublications, activeProjectData]);

    // --- Effects ---
    useEffect(() => {
        const root = parseMarkdown();
        const { nodes, links } = flattenData(root);
        setData({ nodes, links });
    }, []);
    
    useEffect(() => {
        // When the active project changes, we need to reset/reload transient state like feeds
        setAllPublications([]);
        if (activeProjectData && activeProjectData.trackedFeeds.length > 0) {
            handleRefreshFeeds(true); // `true` indicates it's a project switch
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeProject?.id]);

    // --- Handlers ---
    const handleUpdateCustomRelationshipTypes = useCallback((updater: (currentTypes: CustomRelationshipType[]) => CustomRelationshipType[]) => {
        setSession(prev => ({
            ...prev,
            customRelationshipTypes: updater(prev.customRelationshipTypes || []),
        }));
    }, [setSession]);

    const handleToggleRelationshipType = useCallback((typeName: string, isDefault: boolean) => {
        setSession(prev => {
            const newSession = { ...prev };
            if (isDefault) {
                const disabled = new Set(newSession.disabledDefaultTypes || []);
                disabled.has(typeName) ? disabled.delete(typeName) : disabled.add(typeName);
                newSession.disabledDefaultTypes = Array.from(disabled);
            } else {
                const disabled = new Set(newSession.disabledCustomTypes || []);
                disabled.has(typeName) ? disabled.delete(typeName) : disabled.add(typeName);
                newSession.disabledCustomTypes = Array.from(disabled);
            }
            return newSession;
        });
    }, [setSession]);
    
    const handleSearchResultSelect = useCallback((node: D3Node) => {
        setSelectedNode(node);
        setFocusedNode(node);
        setSearchQuery(node.name);
        setSearchResults([]);
        logActivity('EXPLORE_CONCEPT', { conceptName: node.name, conceptId: node.id });
    }, [logActivity, setFocusedNode, setSearchQuery, setSearchResults, setSelectedNode]);

    const handleNodeSelect = useCallback((node: D3Node | null) => {
        setSelectedNode(node);
        if(node) {
            setFocusedNode(node);
            setSearchQuery(node.name);
            setSearchResults([]);
            logActivity('EXPLORE_CONCEPT', { conceptName: node.name, conceptId: node.id });
        } else {
            setFocusedNode(null);
            setSearchQuery('');
        }
    }, [logActivity, setFocusedNode, setSearchQuery, setSearchResults, setSelectedNode]);

    const handleAddToMapTray = useCallback((node: D3Node) => {
        if (activeProjectData?.mapTrayConceptIds.includes(node.id)) {
            return;
        }
        logActivity('ADD_TO_TRAY', { conceptName: node.name, conceptId: node.id });
        updateActiveProjectData(d => {
            if (d.mapTrayConceptIds.includes(node.id)) return d;
            return {...d, mapTrayConceptIds: [...d.mapTrayConceptIds, node.id]};
        });
    }, [activeProjectData, updateActiveProjectData, logActivity]);
    
    const handleRemoveFromMapTray = (nodeId: number) => {
        updateActiveProjectData(d => ({...d, mapTrayConceptIds: d.mapTrayConceptIds.filter(id => id !== nodeId) }));
    };

    const handleCloudExport = useCallback(async (): Promise<{ success: boolean; message: string }> => {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/backups`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify([{ id: 'meu_backup', conteudo: session }])
            });

            if (response.ok) {
                return { success: true, message: 'All projects saved to the cloud successfully.' };
            }
            const error = await response.json();
            return { success: false, message: `Error: ${error.message || 'Failed to save session.'}` };
        } catch (error) {
            return { success: false, message: 'Network error. Could not save session.' };
        }
    }, [session]);

    const handleCloudImport = useCallback(async (): Promise<{ success: boolean; message: string }> => {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/backups?id=eq.meu_backup&select=conteudo`, {
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
            });

            if (!response.ok) {
                const error = await response.json();
                return { success: false, message: `Error: ${error.message || 'Failed to fetch backup.'}` };
            }

            const data = await response.json();
            if (data.length === 0) return { success: false, message: 'No cloud backup found.' };

            // A more robust validation could be added here
            setSession(data[0].conteudo);
            return { success: true, message: 'Projects restored from the cloud successfully!' };
        } catch (error) {
            return { success: false, message: 'Network error. Could not fetch backup.' };
        }
    }, [setSession]);

    const handleExportMapData = useCallback(async (): Promise<{ success: boolean; message: string }> => {
        if (!activeProjectData) return { success: false, message: "No active project to export." };
    
        const { nodes, links } = activeProjectData.mapLayout;
        const exportableData = {
            graph: {
                metadata: { projectName: activeProject?.name, exportDate: new Date().toISOString() },
                nodes: nodes.map(node => ({
                    id: node.id, label: node.name, isAiGenerated: !!node.isAiGenerated,
                })),
                edges: links.map(link => ({
                    source: link.source, target: link.target, relations: link.relationshipTypes,
                    metadata: { justification: link.justification || null }
                }))
            }
        };
    
        try {
            const jsonString = JSON.stringify(exportableData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeProjectName = activeProject?.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `concept_map_${safeProjectName}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return { success: true, message: "Map data exported successfully." };
        } catch (error) {
            return { success: false, message: "An error occurred during export." };
        }
    }, [activeProject, activeProjectData]);

    // --- Render Logic ---
    if (!activeProjectData) {
        return <div className="flex items-center justify-center h-full w-full bg-black text-white"><p>Loading project...</p></div>;
    }
    
    const renderView = () => {
        switch(currentView) {
            case 'nebula':
                return data ? (
                    <NebulaGraph 
                        nodes={data.nodes}
                        hierarchicalLinks={data.links}
                        crossLinks={crossLinks}
                        onNodeSelect={handleNodeSelect}
                        selectedNode={selectedNode}
                        focusedNode={focusedNode}
                        hoveredNode={hoveredNode}
                        nodeIdsWithNewPublications={nodeIdsWithNewPublications}
                    />
                ) : <div className="flex items-center justify-center h-full"><p>Loading...</p></div>;
            case 'map':
                return (
                    <MapBuilder
                        layout={activeProjectData.mapLayout}
                        setLayout={(updater) => updateActiveProjectData(d => ({ ...d, mapLayout: typeof updater === 'function' ? updater(d.mapLayout) : updater }))}
                        logActivity={logActivity}
                        relationshipTypes={allRelationshipTypes}
                        onExportMapData={handleExportMapData}
                        allNodes={data?.nodes || []}
                    />
                );
            case 'feed':
                return (
                    <FeedPage
                        trackedFeeds={activeProjectData.trackedFeeds}
                        publications={allPublications}
                        isLoading={isFeedLoading}
                        onRemoveFeed={handleRemoveFeed}
                        onRefreshFeeds={() => handleRefreshFeeds(false)}
                        onMarkAsSeen={handleMarkAsSeen}
                        onRefreshSingleFeed={handleRefreshSingleFeed}
                        logActivity={logActivity}
                    />
                );
            default: return null;
        }
    };

    return (
        <div className="relative w-screen h-screen overflow-hidden bg-black text-white">
            <ProjectDiaryPanel 
                isOpen={isDiaryOpen}
                onClose={() => setIsDiaryOpen(false)}
                entries={activeProjectData.projectDiary}
            />
            {renderView()}
            
            <header className="absolute top-5 left-5 right-5 z-20 flex justify-between items-start gap-4 pointer-events-none">
                <div id="left-ui-container" className="flex flex-col gap-2.5 pointer-events-auto">
                    {currentView === 'nebula' && (
                        <div className="relative">
                            <SearchInput 
                                value={searchQuery}
                                onChange={handleSearchChange}
                                placeholder="Search for a category..."
                            />
                            {searchQuery.length > 1 && searchResults.length > 0 && (
                                <SearchResultsDropdown 
                                    results={searchResults}
                                    onSelect={handleSearchResultSelect}
                                />
                            )}
                        </div>
                    )}
                     <ProjectSwitcher
                        projects={session.projects}
                        activeProject={activeProject}
                        onCreateProject={handleCreateProject}
                        onSwitchProject={handleSwitchProject}
                        onDeleteProject={handleDeleteProject}
                        onRenameProject={handleRenameProject}
                    />
                </div>
                 <div className="flex items-center gap-2 pointer-events-auto">
                    <button onClick={() => setIsDiaryOpen(true)} className="p-2.5 bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-cyan-500" aria-label="Open Project Diary">
                        <DiaryIcon className="w-5 h-5" />
                    </button>
                    <ViewSwitcher currentView={currentView} setView={setCurrentView} />
                    <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-cyan-500" aria-label="Open Settings">
                        <SettingsIcon className="w-5 h-5"/>
                    </button>
                </div>
            </header>

            {currentView === 'nebula' && (
                <InfoPanel 
                    node={selectedNode} 
                    onFindRelated={findRelatedConcepts}
                    isLoading={isLoadingCrossLinks}
                    relatedConcepts={relatedConcepts}
                    onConceptSelect={handleSearchResultSelect}
                    setHoveredNode={setHoveredNode}
                    searchAttempted={searchAttempted}
                    onAddToMapTray={handleAddToMapTray}
                    onAddFeed={handleAddFeed}
                    trackedFeeds={activeProjectData.trackedFeeds}
                    nodeIdsWithNewPublications={nodeIdsWithNewPublications}
                    onGoToFeed={() => setCurrentView('feed')}
                />
            )}

            {currentView !== 'feed' && (
                 <MapTray concepts={mapTrayConcepts} onRemove={handleRemoveFromMapTray} />
            )}

            {currentView === 'map' && activeProjectData.mapLayout.nodes.length === 0 && (
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-gray-400 pointer-events-none z-0">
                    <BrainCircuit className="w-24 h-24 mx-auto text-gray-600"/>
                    <h2 className="text-2xl mt-4 font-bold">Conceptual Map Builder</h2>
                    <p className="mt-2 max-w-md">
                        Drag concepts from the "Map Tray" on the right to start building your map.
                        <br />
                        You can add concepts to the tray while exploring the Nebula.
                    </p>
                </div>
            )}
            
            <SettingsModal 
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                onCloudExport={handleCloudExport}
                onCloudImport={handleCloudImport}
                customRelationshipTypes={session.customRelationshipTypes || []}
                onUpdateCustomRelationshipTypes={handleUpdateCustomRelationshipTypes}
                ai={ai}
                defaultRelationshipTypes={defaultRelationshipTypes}
                disabledDefaultTypes={session.disabledDefaultTypes || []}
                disabledCustomTypes={session.disabledCustomTypes || []}
                onToggleRelationshipType={handleToggleRelationshipType}
            />
        </div>
    );
};

export default App;
