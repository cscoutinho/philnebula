
import { useState, useRef, useEffect, useCallback } from 'react';
import { select, pointer } from 'd3-selection';
import { drag } from 'd3-drag';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import 'd3-transition';
import type { MapNode, MapLink } from '../../../types';
import { MapBuilderProps, MapUIState, MapAIState, LogicalWorkbenchState } from '../types';

interface useMapInteractionProps extends Pick<MapBuilderProps, 'layout' | 'setLayout' | 'logActivity'> {
    svgRef: React.RefObject<SVGSVGElement>;
    uiState: MapUIState;
    aiState: MapAIState;
    nodeMap: Map<string | number, MapNode>;
}

export const useMapInteraction = ({
    svgRef,
    layout,
    setLayout,
    logActivity,
    uiState,
    aiState,
    nodeMap,
}: useMapInteractionProps) => {
    const {
        clearSelections,
        setFloatingTooltip,
        editingNodeId,
        setEditingNodeId,
        linkingNode,
        setLinkingNode,
        relationshipMenu,
        setRelationshipMenu,
        selectedNodeId,
        setSelectedNodeId,
        setRegionSelectedNodeIds,
        setNodeContextMenu,
    } = uiState;
    const { nodes, links } = layout;

    const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const transformRef = useRef(zoomIdentity);
    const isDraggingSelection = useRef(false);

    const [resizingState, setResizingState] = useState<{ nodeId: number | string, initialWidth: number, initialHeight: number, startX: number, startY: number, shape: 'rect' | 'circle' } | null>(null);
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
    
    const getPointInWorldSpace = useCallback((event: React.MouseEvent | React.PointerEvent | PointerEvent) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const [mx, my] = pointer(event, svgRef.current);
        const [worldX, worldY] = transformRef.current.invert([mx, my]);
        return { x: worldX, y: worldY };
    }, [svgRef]);

    const updateNodePosition = useCallback((nodeId: number | string, x: number, y: number) => {
        setLayout(prev => ({
            ...prev,
            nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, x, y } : n)
        }));
    }, [setLayout]);

    const handleNodeClick = (e: React.MouseEvent, node: MapNode) => {
        e.stopPropagation();
        setFloatingTooltip(null);
        setEditingNodeId(null);

        if ((node.isAiGenerated || node.isDialectic || node.isHistorical) && node.synthesisInfo) {
             setFloatingTooltip({ x: e.clientX, y: e.clientY, title: node.name, text: node.synthesisInfo.synthesis, type: 'synthesis' });
        }
         if (node.isCitation && node.citationData) {
            setFloatingTooltip({ x: e.clientX, y: e.clientY, title: 'Citation Details', text: [node.citationData], type: 'citation' });
        }

        if (linkingNode !== null) {
            if (linkingNode !== node.id) {
                const existingLink = links.find(l => (l.source === linkingNode && l.target === node.id) || (l.source === node.id && l.target === linkingNode));
                if (!existingLink) {
                    const sourceNode = nodeMap.get(linkingNode);
                    if (sourceNode) {
                        const midPoint = {
                            x: (sourceNode.x + node.x) / 2,
                            y: (sourceNode.y + node.y) / 2,
                        };
                        const [screenX, screenY] = transformRef.current.apply([midPoint.x, midPoint.y]);
                        setRelationshipMenu({
                            sourceId: linkingNode,
                            targetId: node.id,
                            x: screenX,
                            y: screenY,
                        });
                    }
                }
            }
            setLinkingNode(null);
        } else {
            setSelectedNodeId(node.id);
            setRegionSelectedNodeIds(new Set());
        }
    };
    
    const handleBackgroundClick = (e: React.MouseEvent) => {
        if (!isDraggingSelection.current) {
            clearSelections();
            aiState.setDefinitionAnalysisState(null);
        }
        if (editingNodeId) {
            const node = nodeMap.get(editingNodeId);
            if (node?.isUserDefined && node.name === "New Concept") {
                 logActivity('CREATE_USER_NODE', { conceptName: node.name, conceptId: node.id });
            }
            setEditingNodeId(null);
        }
    };

    const handleBackgroundDoubleClick = (e: React.MouseEvent) => {
        if ((e.target as SVGElement).id !== 'map-background') return;
        
        const { x, y } = getPointInWorldSpace(e);
        const newId = `user_${Date.now()}`;
        const newNode: MapNode = {
            id: newId,
            name: "New Concept",
            x,
            y,
            shape: 'rect',
            width: 150,
            height: 40,
            isUserDefined: true,
        };
        setLayout(prev => ({...prev, nodes: [...prev.nodes, newNode]}));
        setEditingNodeId(newId);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        isDraggingSelection.current = false;
        if ((e.target as SVGElement).id === 'map-background' && e.button === 0 && e.shiftKey) {
            e.stopPropagation(); 
            clearSelections();
            const { x, y } = getPointInWorldSpace(e);
            setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
        }
    };

    useEffect(() => {
        const handlePointerMoveEvent = (e: PointerEvent) => {
            e.preventDefault();
            isDraggingSelection.current = true;
            
            const { x: endX, y: endY } = getPointInWorldSpace(e);

            setSelectionBox(prevBox => {
                if (!prevBox) return null;
                const newSelectionBox = { ...prevBox, endX, endY };
                
                const xMin = Math.min(newSelectionBox.startX, newSelectionBox.endX);
                const xMax = Math.max(newSelectionBox.startX, newSelectionBox.endX);
                const yMin = Math.min(newSelectionBox.startY, newSelectionBox.endY);
                const yMax = Math.max(newSelectionBox.startY, newSelectionBox.endY);

                const selectedIds = new Set<number|string>();
                nodes.forEach(node => {
                    if (node.x >= xMin && node.x <= xMax && node.y >= yMin && node.y <= yMax) {
                        selectedIds.add(node.id);
                    }
                });
                setRegionSelectedNodeIds(selectedIds);
                return newSelectionBox;
            });
        };

        const handlePointerUpEvent = () => {
            setSelectionBox(null);
        };

        if (selectionBox) {
            window.addEventListener('pointermove', handlePointerMoveEvent);
            window.addEventListener('pointerup', handlePointerUpEvent, { once: true });
        }

        return () => {
            window.removeEventListener('pointermove', handlePointerMoveEvent);
            window.removeEventListener('pointerup', handlePointerUpEvent);
        };
    }, [selectionBox, getPointInWorldSpace, nodes, setRegionSelectedNodeIds]);

    const handleResizeStart = (e: React.PointerEvent, node: MapNode) => {
        e.preventDefault();
        e.stopPropagation();
        setResizingState({
            nodeId: node.id,
            initialWidth: node.width,
            initialHeight: node.height,
            startX: e.clientX,
            startY: e.clientY,
            shape: node.shape,
        });
    };

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!resizingState) return;
            const dx = (e.clientX - resizingState.startX) / transformRef.current.k;
            const dy = (e.clientY - resizingState.startY) / transformRef.current.k;
            
            let newWidth = resizingState.initialWidth + dx;
            let newHeight = resizingState.initialHeight + dy;
            
            if (resizingState.shape === 'circle') {
                const newDiameter = Math.max(newWidth, newHeight);
                newWidth = newDiameter;
                newHeight = newDiameter;
            }

            setLayout(prev => ({
                ...prev,
                nodes: prev.nodes.map(n =>
                    n.id === resizingState.nodeId ? { ...n, width: Math.max(40, newWidth), height: Math.max(40, newHeight) } : n
                )
            }));
        };

        const handlePointerUp = () => setResizingState(null);

        if (resizingState) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
        }

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [resizingState, setLayout]);

    useEffect(() => {
        if (!svgRef.current) return;
        const svg = select(svgRef.current);
        
        if (!zoomBehaviorRef.current) {
             const zoomBehavior = zoom<SVGSVGElement, unknown>()
                .scaleExtent([0.1, 4])
                .filter(event => !event.shiftKey)
                .on('zoom', (event) => {
                    if (resizingState) return;
                    transformRef.current = event.transform;
                    select('#map-content-group').attr('transform', event.transform.toString());
                    uiState.setZoomLevel(event.transform.k);
                });
            zoomBehaviorRef.current = zoomBehavior;
            svg.call(zoomBehavior).on("dblclick.zoom", null);
        }

        const dragBehavior = drag<SVGGElement, MapNode>()
            .filter(event => {
                const target = event.target as SVGElement;
                return !resizingState && event.button === 0 && !target.classList.contains('resize-handle') && target.closest('foreignObject') === null;
            })
            .on('start', (event, d) => {
                select(event.sourceEvent.target.closest('g')).raise();
                setSelectedNodeId(d.id);
            })
            .on('drag', (event, d) => {
                updateNodePosition(d.id, event.x, event.y);
            })
            .on('end', () => {});
        
        svg.select<SVGGElement>('#map-content-group')
            .selectAll<SVGGElement, MapNode>('g.map-node')
            .call(dragBehavior);
        
    }, [nodes, resizingState, updateNodePosition, setSelectedNodeId, uiState, svgRef]);

    const handleDrop = (e: React.DragEvent<SVGSVGElement>) => {
        e.preventDefault();
        const dataString = e.dataTransfer.getData('application/json');
        if (!dataString || !svgRef.current) return;

        const droppedNode: { id: number; name: string; } = JSON.parse(dataString);
        if (nodes.find(n => n.id === droppedNode.id)) return;

        const { x, y } = getPointInWorldSpace(e);

        setLayout(prev => ({ ...prev, nodes: [...prev.nodes, { id: droppedNode.id, name: droppedNode.name, x, y, shape: 'rect', width: 150, height: 40 }] }));
    };

    const handleDragOver = (e: React.DragEvent<SVGSVGElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleNodeContextMenu = (e: React.MouseEvent, nodeId: number | string) => {
        e.preventDefault();
        e.stopPropagation();
        clearSelections();
        setSelectedNodeId(nodeId);
        setNodeContextMenu({ x: e.clientX, y: e.clientY, nodeId });
    };
    
    const handleNodeDoubleClick = (e: React.MouseEvent, node: MapNode) => {
        e.stopPropagation();
        if (node.isUserDefined) {
            setEditingNodeId(node.id);
        }
    };
    
    const handleOpenCombinedArgumentWorkbench = (e: React.MouseEvent) => {
        const selectedNodes = Array.from(uiState.regionSelectedNodeIds).map(id => nodeMap.get(id)).filter((n): n is MapNode => !!n);
        const internalLinks = links.filter(l => uiState.regionSelectedNodeIds.has(l.source) && uiState.regionSelectedNodeIds.has(l.target));
    
        const sourceIds = new Set(internalLinks.map(l => l.source));
        const targetIds = new Set(internalLinks.map(l => l.target));
    
        const conclusionNodes = selectedNodes.filter(n => targetIds.has(n.id) && !sourceIds.has(n.id));
        
        if (conclusionNodes.length !== 1) {
            alert("Invalid argument structure. Please select a group of nodes with exactly one final conclusion (a node that does not lead to any other selected node).");
            return;
        }
        
        const conclusion = conclusionNodes[0];
        const premises = selectedNodes.filter(n => n.id !== conclusion.id);
    
        if (premises.length === 0) {
            alert("Invalid argument structure. At least one premise is required.");
            return;
        }
    
        const workbenchState: LogicalWorkbenchState = {
            combinedArgument: { premises, conclusion },
            x: e.clientX,
            y: e.clientY
        };
        uiState.setLogicalWorkbench(workbenchState);
        aiState.handleFormalizeArgument(workbenchState);
    };

    return {
        zoomBehaviorRef,
        selectionBox,
        regionSelectedNodeIds: uiState.regionSelectedNodeIds,
        linkingNode,
        resizingState,
        handlePointerDown,
        handleDrop,
        handleDragOver,
        handleBackgroundClick,
        handleBackgroundDoubleClick,
        handleNodeClick,
        handleNodeContextMenu,
        handleNodeDoubleClick,
        handleResizeStart,
        updateNodePosition,
        handleOpenCombinedArgumentWorkbench,
    };
};