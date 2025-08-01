

import { useState, useCallback } from 'react';
import { D3Node, MapNode, MapLink, RelationshipType, Citation, LogicalConstruct, FormalizationResult, ProjectActivityType } from '../../../types';
import { NodeContextMenuState, LinkContextMenuState, EditLinkTypesMenuState, FloatingTooltipState, ChangeNodeState, ColorPickerState, DialecticAnalysisState, LogicalWorkbenchState } from '../types';
import { getMidpoint } from '../utils/calculations';

const textColors = ['#FFFFFF', '#FDE047', '#A7F3D0', '#A5B4FC', '#F9A8D4', '#FCA5A5']; // White, Yellow, Green, Indigo, Pink, Red

interface UseMapUIProps {
    allNodes: D3Node[];
    layout: { nodes: MapNode[], links: MapLink[], logicalConstructs: LogicalConstruct[] };
    setLayout: React.Dispatch<React.SetStateAction<{ nodes: MapNode[], links: MapLink[], logicalConstructs: LogicalConstruct[] }>>;
    logActivity: (type: ProjectActivityType, payload: any) => void;
    nodeMap: Map<string | number, MapNode>;
}

export const useMapUI = ({ allNodes, layout, setLayout, logActivity, nodeMap }: UseMapUIProps) => {
    const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenuState | null>(null);
    const [linkContextMenu, setLinkContextMenu] = useState<LinkContextMenuState | null>(null);
    const [editLinkTypesMenu, setEditLinkTypesMenu] = useState<EditLinkTypesMenuState | null>(null);
    const [floatingTooltip, setFloatingTooltip] = useState<FloatingTooltipState | null>(null);
    const [linkingNode, setLinkingNode] = useState<number | string | null>(null);
    const [relationshipMenu, setRelationshipMenu] = useState<{ sourceId: string | number, targetId: string | number, x: number, y: number } | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<number | string | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | number | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [regionSelectedNodeIds, setRegionSelectedNodeIds] = useState<Set<number|string>>(new Set());
    const [changingNodeState, setChangingNodeState] = useState<ChangeNodeState | null>(null);
    const [changeQuery, setChangeQuery] = useState('');
    const [changeResults, setChangeResults] = useState<D3Node[]>([]);
    const [dialecticAnalysis, setDialecticAnalysis] = useState<DialecticAnalysisState | null>(null);
    const [logicalWorkbench, setLogicalWorkbench] = useState<LogicalWorkbenchState | null>(null);
    const [isLogicVizVisible, setIsLogicVizVisible] = useState(false);
    const [colorPicker, setColorPicker] = useState<ColorPickerState | null>(null);
    const [studioState, setStudioState] = useState<{ nodeId: string | number; x: number; y: number } | null>(null);

    const clearSelections = useCallback(() => {
        setNodeContextMenu(null);
        setLinkContextMenu(null);
        setFloatingTooltip(null);
        setSelectedNodeId(null);
        setEditingNodeId(null);
        setRegionSelectedNodeIds(new Set());
        setDialecticAnalysis(null);
        setLogicalWorkbench(null);
        setColorPicker(null);
        if (linkingNode) setLinkingNode(null);
        if (relationshipMenu) setRelationshipMenu(null);
        if (studioState) setStudioState(null);
        if (editLinkTypesMenu) setEditLinkTypesMenu(null);
        if (changingNodeState) setChangingNodeState(null);
    }, [linkingNode, relationshipMenu, editLinkTypesMenu, changingNodeState, studioState]);

    const handleChangeConceptSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setChangeQuery(query);

        if (query.length < 2) {
            setChangeResults([]);
            return;
        }

        const lcQuery = query.toLowerCase();
        const foundNodes = allNodes
            .filter(n => n.name.toLowerCase().includes(lcQuery) && !layout.nodes.some(mapNode => mapNode.id === n.id))
            .sort((a, b) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                const getScore = (name: string) => {
                    if (name === lcQuery) return 5;
                    const words = name.replace(/[:(),]/g, '').split(/[\s-]+/);
                    if (words.includes(lcQuery)) return 4;
                    if (name.startsWith(lcQuery)) return 3;
                    return 2;
                };
                const scoreA = getScore(aName);
                const scoreB = getScore(bName);
                if (scoreA !== scoreB) return scoreB - scoreA;
                if (a.name.length !== b.name.length) return a.name.length - b.name.length;
                if (a.depth !== b.depth) return a.depth - b.depth;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 10);
        setChangeResults(foundNodes);
    }, [allNodes, layout.nodes]);
    
    const handleConceptChangeSelect = useCallback((newNodeData: D3Node) => {
        if (!changingNodeState) return;
        
        const oldNode = nodeMap.get(changingNodeState.nodeId);

        logActivity('CHANGE_CONCEPT', {
            oldConceptName: oldNode?.name || 'Unknown',
            newConceptName: newNodeData.name,
        });

        setLayout(prev => {
            const newNodes = prev.nodes.map(n =>
                n.id === changingNodeState.nodeId
                ? { ...n, id: newNodeData.id, name: newNodeData.name, isAiGenerated: false, isHistorical: false, isUserDefined: false, synthesisInfo: undefined, isDialectic: false, isCitation: false }
                : n
            );
            const newLinks = prev.links.map(l => {
                if (l.source === changingNodeState.nodeId) return { ...l, source: newNodeData.id };
                if (l.target === changingNodeState.nodeId) return { ...l, target: newNodeData.id };
                return l;
            });
            return { ...prev, nodes: newNodes, links: newLinks };
        });

        setChangingNodeState(null);
        setChangeQuery('');
        setChangeResults([]);
    }, [changingNodeState, setLayout, nodeMap, logActivity]);
    
    const handleCreateLogicalConstruct = useCallback((formalizationResult: FormalizationResult | null, selectedFormalizationIndex: number) => {
        if (!logicalWorkbench?.combinedArgument || !formalizationResult) return;
        
        const { premises, conclusion } = logicalWorkbench.combinedArgument;
        const selectedChoice = formalizationResult.choices[selectedFormalizationIndex];

        const newConstruct: LogicalConstruct = {
            id: `lconstruct_${Date.now()}`,
            premiseNodeIds: premises.map(p => p.id),
            conclusionNodeId: conclusion.id,
            operator: 'AND',
            propositions: formalizationResult.propositions,
            critique: formalizationResult.critique,
            formalRepresentation: selectedChoice.formalRepresentation,
            suggestedSystem: selectedChoice.suggestedSystem,
            rationale: selectedChoice.rationale,
        };

        logActivity('CREATE_LOGICAL_CONSTRUCT', {
            conclusionName: conclusion.name,
            premiseCount: premises.length
        });
        
        setLayout(prev => ({
            ...prev,
            logicalConstructs: [...(prev.logicalConstructs || []), newConstruct]
        }));

        clearSelections();
    }, [logicalWorkbench, setLayout, logActivity, clearSelections]);

    const handleTextColorChange = (nodeId: string | number, color: string) => {
        setLayout(prev => ({
            ...prev,
            nodes: prev.nodes.map(n =>
                n.id === nodeId ? { ...n, textColor: color } : n
            )
        }));
        setColorPicker(null);
    };

    const deleteNode = useCallback((nodeId: number | string) => {
        setLayout(prev => ({
            nodes: prev.nodes.filter(n => n.id !== nodeId),
            links: prev.links.filter(l => l.source !== nodeId && l.target !== nodeId),
            logicalConstructs: (prev.logicalConstructs || []).filter(c => c.conclusionNodeId !== nodeId && !c.premiseNodeIds.includes(nodeId)),
        }));
        setNodeContextMenu(null);
    }, [setLayout]);

    const updateNodeShape = useCallback((nodeId: number | string, shape: 'rect' | 'circle') => {
        setLayout(prev => ({
            ...prev,
            nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, shape } : n)
        }));
        setNodeContextMenu(null);
    }, [setLayout]);
    
    const updateLinkPathStyle = useCallback((link: MapLink, pathStyle: 'straight' | 'curved') => {
        setLayout(prev => ({
            ...prev,
            links: prev.links.map(l => (l.source === link.source && l.target === link.target) ? { ...l, pathStyle } : l)
        }));
        setLinkContextMenu(null);
    }, [setLayout]);
    
    const updateLinkRelationshipTypes = useCallback((linkToUpdate: MapLink, newTypes: RelationshipType[]) => {
        setLayout(prev => ({
            ...prev,
            links: prev.links.map(l =>
                (l.source === linkToUpdate.source && l.target === linkToUpdate.target)
                ? { ...l, relationshipTypes: newTypes.length > 0 ? newTypes : ['Unclassified'] }
                : l
            )
        }));
        setLinkContextMenu(null);
        setEditLinkTypesMenu(null);
    }, [setLayout]);
    
    const deleteLink = useCallback((link: MapLink) => {
        setLayout(prev => ({
            ...prev,
            links: prev.links.filter(l => !(l.source === link.source && l.target === link.target))
        }));
         setLinkContextMenu(null);
    }, [setLayout]);
     
    const createLink = useCallback((sourceId: string | number, targetId: string | number, relationshipTypes: RelationshipType[]) => {
        const sourceNode = nodeMap.get(sourceId);
        const targetNode = nodeMap.get(targetId);

        if (sourceNode && targetNode) {
            logActivity('CREATE_MAP_LINK', {
                sourceId,
                targetId,
                sourceName: sourceNode.name,
                targetName: targetNode.name,
                relationships: relationshipTypes
            });
            setLayout(prev => ({
                ...prev,
                links: [...prev.links, {
                    source: sourceId,
                    target: targetId,
                    pathStyle: 'straight',
                    relationshipTypes: relationshipTypes.length > 0 ? relationshipTypes : ['Unclassified'],
                    justificationState: 'idle',
                    implicationsState: 'idle',
                    formalizationState: 'idle',
                }]
            }));
        }
        setRelationshipMenu(null);
    }, [setLayout, logActivity, nodeMap]);

    const handleNodeNameChange = (nodeId: string | number, newName: string) => {
        setLayout(prev => ({
            ...prev,
            nodes: prev.nodes.map(n =>
                n.id === nodeId ? { ...n, name: newName } : n
            )
        }));
    };
    
    const handlePinCitation = useCallback((link: MapLink, citation: Citation) => {
        const linkMidpoint = getMidpoint(link, nodeMap);
        
        const newId = `citation_${Date.now()}`;
        const newNode: MapNode = {
            id: newId,
            name: `${citation.source}: ${citation.sourceTitle.substring(0, 20)}...`,
            x: linkMidpoint.x + 40,
            y: linkMidpoint.y - 40,
            shape: 'rect',
            width: 160,
            height: 40,
            isCitation: true,
            citationData: citation
        };

        const newLink: MapLink = {
            source: link.source,
            target: newId,
            pathStyle: 'curved',
            relationshipTypes: ['Cited'],
        };

        setLayout(prev => ({
            ...prev,
            nodes: [...prev.nodes, newNode],
            links: [...prev.links, newLink]
        }));
        setFloatingTooltip(null);
    }, [setLayout, nodeMap]);

    const handleLinkContextMenu = useCallback((e: React.MouseEvent, link: MapLink) => {
        e.preventDefault();
        e.stopPropagation();
        clearSelections();
        setLinkContextMenu({ x: e.clientX, y: e.clientY, link });
    }, [clearSelections]);

    const handleSaveNote = useCallback((nodeId: string | number, content: string) => {
        setLayout(prev => ({
            ...prev,
            nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, notes: content } : n)
        }));
         logActivity('EDIT_NOTE', {
            conceptId: nodeId,
            conceptName: nodeMap.get(nodeId)?.name || 'Unknown',
            noteLength: content.length,
        });
    }, [setLayout, logActivity, nodeMap]);

    return {
        textColors,
        nodeContextMenu, setNodeContextMenu,
        linkContextMenu, setLinkContextMenu,
        editLinkTypesMenu, setEditLinkTypesMenu,
        floatingTooltip, setFloatingTooltip,
        linkingNode, setLinkingNode,
        relationshipMenu, setRelationshipMenu,
        selectedNodeId, setSelectedNodeId,
        editingNodeId, setEditingNodeId,
        zoomLevel, setZoomLevel,
        regionSelectedNodeIds, setRegionSelectedNodeIds,
        changingNodeState, setChangingNodeState,
        changeQuery, setChangeQuery,
        changeResults, setChangeResults,
        dialecticAnalysis, setDialecticAnalysis,
        logicalWorkbench, setLogicalWorkbench,
        isLogicVizVisible, setIsLogicVizVisible,
        colorPicker, setColorPicker,
        studioState, setStudioState,
        clearSelections,
        handleChangeConceptSearch,
        handleConceptChangeSelect,
        handleCreateLogicalConstruct,
        handleTextColorChange,
        deleteNode,
        updateNodeShape,
        updateLinkPathStyle,
        updateLinkRelationshipTypes,
        deleteLink,
        createLink,
        handleNodeNameChange,
        handlePinCitation,
        handleLinkContextMenu,
        handleSaveNote,
    };
};